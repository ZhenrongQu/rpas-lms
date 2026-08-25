import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  consumeCreditFor,
  countAvailableCredits,
  grantCredit,
  holdCreditForBooking,
  releaseCreditFor,
  revokeCredit,
} from "./credits";

const CUSTOMER = "credit-user";

async function reset() {
  await prisma.flightReviewCredit.deleteMany();
  await prisma.flightReviewBooking.deleteMany();
  await prisma.flightReviewSlot.deleteMany();
  await prisma.customer.deleteMany();
}

/** A booking row to hold a credit against. Slot/booking specifics are the
 *  booking module's concern; here they are just something to point at. */
async function makeBooking(id: string): Promise<string> {
  const slot = await prisma.flightReviewSlot.create({
    data: {
      startsAt: new Date(Date.now() + 7 * 24 * 3600_000),
      location: "YVR",
      examinerName: "Ex",
    },
  });
  const booking = await prisma.flightReviewBooking.create({
    data: { id, slotId: slot.id, customerId: CUSTOMER },
  });
  return booking.id;
}

describe("flight review credits (PRD U13 §13.3)", () => {
  beforeEach(async () => {
    await reset();
    await prisma.customer.create({ data: { id: CUSTOMER, email: "credit@test.local" } });
  });
  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("a freshly granted credit is available", async () => {
    await grantCredit(CUSTOMER, "stripe_checkout", "pay_1");
    expect(await countAvailableCredits(CUSTOMER)).toBe(1);
  });

  it("available → held → consumed: a completed review burns the credit", async () => {
    await grantCredit(CUSTOMER, "course_bundle");
    const bookingId = await makeBooking("bk-1");

    expect(await holdCreditForBooking(CUSTOMER, bookingId, prisma)).toBe(true);
    expect(await countAvailableCredits(CUSTOMER)).toBe(0); // held, not spendable

    await consumeCreditFor(bookingId, prisma);
    expect(await countAvailableCredits(CUSTOMER)).toBe(0); // and never again
    const credit = await prisma.flightReviewCredit.findFirstOrThrow({ where: { customerId: CUSTOMER } });
    expect(credit.consumedAt).not.toBeNull();
    expect(credit.bookingId).toBe(bookingId); // still answers "which review did this pay for"
  });

  it("held → available: releasing a credit puts it back in the pool", async () => {
    await grantCredit(CUSTOMER, "admin_grant");
    const bookingId = await makeBooking("bk-2");
    await holdCreditForBooking(CUSTOMER, bookingId, prisma);

    await releaseCreditFor(bookingId, prisma);

    expect(await countAvailableCredits(CUSTOMER)).toBe(1);
  });

  it("available → revoked: a refunded credit leaves circulation", async () => {
    const creditId = await grantCredit(CUSTOMER, "stripe_checkout", "pay_2");
    await revokeCredit(creditId);
    expect(await countAvailableCredits(CUSTOMER)).toBe(0);
  });

  it("holding fails when the customer has nothing spendable", async () => {
    const bookingId = await makeBooking("bk-3");
    expect(await holdCreditForBooking(CUSTOMER, bookingId, prisma)).toBe(false);
  });

  it("spends the oldest credit first", async () => {
    const first = await grantCredit(CUSTOMER, "course_bundle");
    await new Promise((r) => setTimeout(r, 5));
    await grantCredit(CUSTOMER, "stripe_checkout", "pay_3");
    const bookingId = await makeBooking("bk-4");

    await holdCreditForBooking(CUSTOMER, bookingId, prisma);

    const held = await prisma.flightReviewCredit.findFirstOrThrow({ where: { bookingId } });
    expect(held.id).toBe(first);
    expect(await countAvailableCredits(CUSTOMER)).toBe(1);
  });

  it("consuming twice does not move the burn timestamp", async () => {
    await grantCredit(CUSTOMER, "course_bundle");
    const bookingId = await makeBooking("bk-5");
    await holdCreditForBooking(CUSTOMER, bookingId, prisma);

    await consumeCreditFor(bookingId, prisma, new Date("2026-01-01T00:00:00Z"));
    await consumeCreditFor(bookingId, prisma, new Date("2026-06-01T00:00:00Z"));

    const credit = await prisma.flightReviewCredit.findFirstOrThrow({ where: { bookingId } });
    expect(credit.consumedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });
});
