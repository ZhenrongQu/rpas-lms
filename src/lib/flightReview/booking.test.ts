import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  bookSlot,
  cancelBooking,
  closeBooking,
  getActiveBooking,
  listOpenSlots,
  listUserBookings,
  CANCELLATION_REFUND_WINDOW_MS,
} from "./booking";
import { countAvailableCredits, grantCredit } from "./credits";

const U1 = "fr-book-u1";
const U2 = "fr-book-u2";
const SLOT_A = "fr-book-slot-a";
const SLOT_B = "fr-book-slot-b";
const SLOT_PAST = "fr-book-slot-past";
const SLOT_ARCHIVED = "fr-book-slot-archived";
const USERS = [U1, U2];

const plusDays = (d: number) => new Date(Date.now() + d * 86_400_000);

async function reset() {
  await prisma.flightReviewCredit.deleteMany();
  await prisma.flightReviewBooking.deleteMany();
  await prisma.flightReviewSlot.deleteMany();
  await prisma.customer.deleteMany({ where: { id: { in: USERS } } });
}

describe("flight review booking (PRD U13)", () => {
  beforeEach(async () => {
    await reset();
    await prisma.customer.createMany({
      data: [
        { id: U1, email: "fr-u1@test.dev", displayName: "U1", accessTier: "PAID" },
        { id: U2, email: "fr-u2@test.dev", displayName: "U2", accessTier: "PAID" },
      ],
    });
    await prisma.flightReviewSlot.createMany({
      data: [
        { id: SLOT_A, startsAt: plusDays(7), location: "YVR", examinerName: "Pat" },
        { id: SLOT_B, startsAt: plusDays(10), location: "YVR", examinerName: "Sam" },
        { id: SLOT_PAST, startsAt: plusDays(-1), location: "YVR", examinerName: "Old" },
        {
          id: SLOT_ARCHIVED,
          startsAt: plusDays(9),
          location: "YVR",
          examinerName: "Arch",
          status: "ARCHIVED",
        },
      ],
    });
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  describe("booking spends a credit", () => {
    it("books an open future slot and holds the credit", async () => {
      await grantCredit(U1, "course_bundle");

      const r = await bookSlot(U1, SLOT_A);

      expect(r.ok).toBe(true);
      if (r.ok) expect(r.action).toBe("created");
      expect((await getActiveBooking(U1))?.slotId).toBe(SLOT_A);
      expect(await countAvailableCredits(U1)).toBe(0);
    });

    it("refuses a student with no credit — paid course access alone is not enough", async () => {
      const r = await bookSlot(U1, SLOT_A);

      expect(r).toEqual({ ok: false, error: "no_credit" });
      // …and leaves nothing behind: the half-created booking must roll back.
      expect(await prisma.flightReviewBooking.count()).toBe(0);
      expect((await listOpenSlots()).map((s) => s.id)).toContain(SLOT_A);
    });

    it("rejects a second student on the same slot", async () => {
      await grantCredit(U1, "course_bundle");
      await grantCredit(U2, "course_bundle");
      await bookSlot(U1, SLOT_A);

      expect(await bookSlot(U2, SLOT_A)).toEqual({ ok: false, error: "slot_taken" });
      expect(await countAvailableCredits(U2)).toBe(1); // a failed booking costs nothing
    });

    it("rejects a past slot and an archived slot", async () => {
      await grantCredit(U1, "course_bundle");
      expect(await bookSlot(U1, SLOT_PAST)).toEqual({ ok: false, error: "slot_past" });
      expect(await bookSlot(U1, SLOT_ARCHIVED)).toEqual({ ok: false, error: "slot_unavailable" });
      expect(await bookSlot(U1, "no-such-slot")).toEqual({ ok: false, error: "slot_unavailable" });
    });

    it("lets exactly one of two concurrent students take a slot", async () => {
      await grantCredit(U1, "course_bundle");
      await grantCredit(U2, "course_bundle");

      const results = await Promise.all([bookSlot(U1, SLOT_A), bookSlot(U2, SLOT_A)]);

      expect(results.filter((r) => r.ok).length).toBe(1);
      expect(await prisma.flightReviewBooking.count({ where: { status: "BOOKED" } })).toBe(1);
    });
  });

  describe("rescheduling", () => {
    it("moves the booking, frees the old slot, and does not spend a second credit", async () => {
      await grantCredit(U1, "course_bundle");
      await grantCredit(U1, "stripe_checkout", "pay_1"); // a spare, to prove it is untouched
      await bookSlot(U1, SLOT_A);
      expect(await countAvailableCredits(U1)).toBe(1);

      const r = await bookSlot(U1, SLOT_B);

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.action).toBe("rescheduled");
        expect(r.previousSlot?.id).toBe(SLOT_A);
      }
      expect((await getActiveBooking(U1))?.slotId).toBe(SLOT_B);
      expect(await countAvailableCredits(U1)).toBe(1); // still just the spare
      const openIds = (await listOpenSlots()).map((s) => s.id);
      expect(openIds).toContain(SLOT_A);
      expect(openIds).not.toContain(SLOT_B);
    });

    it("re-booking the same slot is a no-op", async () => {
      await grantCredit(U1, "course_bundle");
      await bookSlot(U1, SLOT_A);

      const r = await bookSlot(U1, SLOT_A);

      expect(r.ok).toBe(true);
      if (r.ok) expect(r.action).toBe("unchanged");
      expect(await prisma.flightReviewBooking.count()).toBe(1);
    });
  });

  describe("cancellation and the 48-hour window", () => {
    /** Books SLOT_A (7 days out) and returns a clock positioned `hours` before it. */
    async function bookedWithClockAt(hoursBeforeStart: number): Promise<Date> {
      await grantCredit(U1, "course_bundle");
      await bookSlot(U1, SLOT_A);
      const slot = await prisma.flightReviewSlot.findUniqueOrThrow({ where: { id: SLOT_A } });
      return new Date(slot.startsAt.getTime() - hoursBeforeStart * 3_600_000);
    }

    it("refunds the credit when cancelling 48 hours out — the boundary is inclusive", async () => {
      const now = await bookedWithClockAt(CANCELLATION_REFUND_WINDOW_MS / 3_600_000);

      const result = await cancelBooking(U1, now);

      expect(result?.creditRefunded).toBe(true);
      expect(await countAvailableCredits(U1)).toBe(1);
    });

    it("burns the credit when cancelling a minute inside the window", async () => {
      const now = await bookedWithClockAt(47 + 59 / 60);

      const result = await cancelBooking(U1, now);

      expect(result?.creditRefunded).toBe(false);
      expect(await countAvailableCredits(U1)).toBe(0);
    });

    it("frees the slot and keeps the booking as history rather than deleting it", async () => {
      await grantCredit(U1, "course_bundle");
      await bookSlot(U1, SLOT_A);

      await cancelBooking(U1);

      expect(await getActiveBooking(U1)).toBeNull();
      expect((await listOpenSlots()).map((s) => s.id)).toContain(SLOT_A);
      const history = await listUserBookings(U1);
      expect(history.length).toBe(1);
      expect(history[0].status).toBe("CANCELLED");
      expect(history[0].cancelledAt).not.toBeNull();
    });

    it("lets a refunded student re-book the slot they just freed", async () => {
      await grantCredit(U1, "course_bundle");
      await bookSlot(U1, SLOT_A);
      await cancelBooking(U1);

      const again = await bookSlot(U1, SLOT_A);

      expect(again.ok).toBe(true);
      expect(await countAvailableCredits(U1)).toBe(0);
    });

    it("returns null when there is nothing to cancel", async () => {
      expect(await cancelBooking(U1)).toBeNull();
    });
  });

  describe("closing out a booking", () => {
    it("marks it completed and burns the credit", async () => {
      await grantCredit(U1, "course_bundle");
      const r = await bookSlot(U1, SLOT_A);
      const bookingId = r.ok ? r.booking.id : "";

      expect(await closeBooking(bookingId, "COMPLETED")).toBe(true);

      const booking = await prisma.flightReviewBooking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.status).toBe("COMPLETED");
      expect(booking.completedAt).not.toBeNull();
      expect(await countAvailableCredits(U1)).toBe(0);
      const credit = await prisma.flightReviewCredit.findFirstOrThrow({ where: { customerId: U1 } });
      expect(credit.consumedAt).not.toBeNull();
    });

    it("burns the credit on a no-show too", async () => {
      await grantCredit(U1, "course_bundle");
      const r = await bookSlot(U1, SLOT_A);
      const bookingId = r.ok ? r.booking.id : "";

      expect(await closeBooking(bookingId, "NO_SHOW")).toBe(true);

      expect(await countAvailableCredits(U1)).toBe(0);
    });

    it("refuses to close a booking that is not in progress", async () => {
      await grantCredit(U1, "course_bundle");
      const r = await bookSlot(U1, SLOT_A);
      const bookingId = r.ok ? r.booking.id : "";
      await closeBooking(bookingId, "COMPLETED");

      expect(await closeBooking(bookingId, "NO_SHOW")).toBe(false);
      expect(await closeBooking("no-such-booking", "COMPLETED")).toBe(false);
    });
  });

  it("the database — not the application — enforces one in-progress booking per student", async () => {
    await grantCredit(U1, "course_bundle");
    await bookSlot(U1, SLOT_A);

    // Bypass bookSlot entirely: the partial unique index must still refuse.
    await expect(
      prisma.flightReviewBooking.create({ data: { customerId: U1, slotId: SLOT_B } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
