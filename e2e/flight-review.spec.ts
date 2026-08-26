import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { e2eDatabaseUrl } from "./env";
import { STUDENT } from "./seed";

/**
 * The booking journey, through the browser, against a real database.
 *
 * This release replaced permanent Flight Review eligibility with a consumable
 * credit (PRD N15) and turned cancellation from a row delete into a status
 * change. Every unit test for that reads the credit table directly; none of
 * them proves the pages, the API routes, and the credit ledger agree — which is
 * the failure a user would actually meet.
 *
 * Credit state is read from the database rather than inferred from the UI: the
 * whole point of N15 is what happens in the ledger, and a page that renders
 * correctly over a wrong ledger is the bug this is looking for.
 */

const prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function creditState() {
  const credit = await prisma.flightReviewCredit.findFirstOrThrow({
    where: { customerId: STUDENT.id },
  });
  return {
    heldByBooking: credit.bookingId !== null,
    consumed: credit.consumedAt !== null,
    revoked: credit.revokedAt !== null,
  };
}

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/en/signin");
  await page.locator('input[autocomplete="username"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/en/dashboard");
}

test("book a review, cancel it, and get the credit back", async ({ page }) => {
  // window.confirm on the cancel button — auto-accept, or the click hangs.
  page.on("dialog", (d) => d.accept());

  expect(await creditState()).toEqual({ heldByBooking: false, consumed: false, revoked: false });

  await signIn(page);

  // --- book -------------------------------------------------------------
  await page.goto("/en/flight-review");
  const slots = page.getByTestId("fr-slot");
  await expect(slots).toHaveCount(2);

  await slots.first().getByTestId("fr-book-slot").click();
  await page.waitForURL("**/en/dashboard");

  // The credit is held by the booking, but not yet spent: the review has not
  // happened, so a cancellation must still be able to return it.
  expect(await creditState()).toEqual({ heldByBooking: true, consumed: false, revoked: false });

  const booking = await prisma.flightReviewBooking.findFirstOrThrow({
    where: { customerId: STUDENT.id },
  });
  expect(booking.status).toBe("BOOKED");

  // U12: the confirmation attempt is recorded against the booking, which is what
  // makes a missed email recoverable rather than invisible. SENT, not FAILED —
  // sendEmail short-circuits to a console log outside production, so this proves
  // the logging path, not the delivery path. Delivery is only observable in the
  // real send, which is why the release checklist keeps it as a manual step.
  const notification = await prisma.notificationLog.findFirst({
    where: { bookingId: booking.id },
  });
  expect(notification?.status).toBe("SENT");

  // --- cancel -----------------------------------------------------------
  await page.getByTestId("fr-cancel").click();
  await expect(page.getByTestId("fr-cancel")).toHaveCount(0);

  // Cancelled ≥48h out, so the credit comes back unspent and reusable.
  expect(await creditState()).toEqual({ heldByBooking: false, consumed: false, revoked: false });

  // The booking row survives as history — N15 replaced the delete with a status
  // change, which is what made the two partial unique indexes necessary.
  const cancelled = await prisma.flightReviewBooking.findUniqueOrThrow({
    where: { id: booking.id },
  });
  expect(cancelled.status).toBe("CANCELLED");
  expect(cancelled.cancelledAt).not.toBeNull();

  // --- rebook -----------------------------------------------------------
  // The released slot must be offered again. Under the old full unique index on
  // slotId this is exactly where it broke: the cancelled row kept the slot
  // locked forever.
  await page.goto("/en/flight-review");
  await expect(page.getByTestId("fr-slot")).toHaveCount(2);

  await page.getByTestId("fr-slot").first().getByTestId("fr-book-slot").click();
  await page.waitForURL("**/en/dashboard");

  expect(await creditState()).toEqual({ heldByBooking: true, consumed: false, revoked: false });
  expect(await prisma.flightReviewBooking.count({ where: { customerId: STUDENT.id } })).toBe(2);
});
