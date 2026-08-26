import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { migrateFlightReviewCredits } from "./migrateCredits";
import { countAvailableCredits } from "./credits";

async function reset() {
  await prisma.flightReviewCredit.deleteMany();
  await prisma.flightReviewBooking.deleteMany();
  await prisma.flightReviewSlot.deleteMany();
  await prisma.entitlement.deleteMany();
  await prisma.customer.deleteMany();
}

const plusDays = (d: number) => new Date(Date.now() + d * 86_400_000);

describe("flight review credit migration (PRD U13 §13.6)", () => {
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("issues a credit to someone who bought Flight Review on its own", async () => {
    await prisma.customer.create({ data: { id: "fr", email: "fr@test.local", accessTier: "FREE" } });
    await prisma.entitlement.create({
      data: { userId: "fr", product: "flight_review", source: "stripe_checkout" },
    });

    await migrateFlightReviewCredits();

    expect(await countAvailableCredits("fr")).toBe(1);
    const credit = await prisma.flightReviewCredit.findFirstOrThrow({ where: { customerId: "fr" } });
    expect(credit.source).toBe("migration");
  });

  it("issues a credit to a course owner, whether by tier or by entitlement", async () => {
    await prisma.customer.create({ data: { id: "tier", email: "tier@test.local", accessTier: "PAID" } });
    await prisma.customer.create({ data: { id: "ent", email: "ent@test.local", accessTier: "FREE" } });
    await prisma.entitlement.create({
      data: { userId: "ent", product: "paid_access", source: "stripe_checkout" },
    });

    await migrateFlightReviewCredits();

    expect(await countAvailableCredits("tier")).toBe(1);
    expect(await countAvailableCredits("ent")).toBe(1);
  });

  it("issues two credits to someone who paid for both — they did pay twice", async () => {
    await prisma.customer.create({ data: { id: "both", email: "both@test.local", accessTier: "PAID" } });
    await prisma.entitlement.create({
      data: { userId: "both", product: "flight_review", source: "stripe_checkout" },
    });

    await migrateFlightReviewCredits();

    expect(await countAvailableCredits("both")).toBe(2);
  });

  it("skips a customer whose access was revoked", async () => {
    await prisma.customer.create({ data: { id: "gone", email: "gone@test.local", accessTier: "FREE" } });
    await prisma.entitlement.create({
      data: {
        userId: "gone",
        product: "flight_review",
        source: "stripe_checkout",
        revokedAt: new Date(),
      },
    });

    await migrateFlightReviewCredits();

    expect(await countAvailableCredits("gone")).toBe(0);
  });

  it("binds a future booking to a credit and leaves it in progress", async () => {
    await prisma.customer.create({ data: { id: "u", email: "u@test.local", accessTier: "PAID" } });
    const slot = await prisma.flightReviewSlot.create({
      data: { startsAt: plusDays(7), location: "YVR", examinerName: "Pat" },
    });
    const booking = await prisma.flightReviewBooking.create({
      data: { customerId: "u", slotId: slot.id },
    });

    await migrateFlightReviewCredits();

    const after = await prisma.flightReviewBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("BOOKED");
    const credit = await prisma.flightReviewCredit.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(credit.consumedAt).toBeNull();
    expect(await countAvailableCredits("u")).toBe(0); // held by the booking
  });

  it("treats a booking whose slot already passed as a delivered review", async () => {
    await prisma.customer.create({ data: { id: "past", email: "past@test.local", accessTier: "PAID" } });
    const slot = await prisma.flightReviewSlot.create({
      data: { startsAt: plusDays(-3), location: "YVR", examinerName: "Pat" },
    });
    const booking = await prisma.flightReviewBooking.create({
      data: { customerId: "past", slotId: slot.id },
    });

    await migrateFlightReviewCredits();

    const after = await prisma.flightReviewBooking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("COMPLETED");
    expect(after.completedAt).toEqual(slot.startsAt);
    const credit = await prisma.flightReviewCredit.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(credit.consumedAt).toEqual(slot.startsAt);
  });

  it("is idempotent — re-running hands out nothing extra", async () => {
    await prisma.customer.create({ data: { id: "u", email: "u@test.local", accessTier: "PAID" } });
    const slot = await prisma.flightReviewSlot.create({
      data: { startsAt: plusDays(7), location: "YVR", examinerName: "Pat" },
    });
    await prisma.flightReviewBooking.create({ data: { customerId: "u", slotId: slot.id } });

    const first = await migrateFlightReviewCredits();
    const second = await migrateFlightReviewCredits();

    expect(first).toMatchObject({ granted: 1, bookingsBound: 1 });
    expect(second).toMatchObject({ granted: 0, skipped: 1, bookingsBound: 0 });
    expect(await prisma.flightReviewCredit.count()).toBe(1);
  });

  it("a dry run reports the plan and writes nothing", async () => {
    await prisma.customer.create({ data: { id: "u", email: "u@test.local", accessTier: "PAID" } });

    const summary = await migrateFlightReviewCredits({ dryRun: true });

    expect(summary.granted).toBe(1);
    expect(await prisma.flightReviewCredit.count()).toBe(0);
  });

  // Found on the first real deploy: the dry run wrote no credits, so the booking
  // pass found none to bind and flagged every pre-existing booking as orphaned —
  // a false alarm at exactly the moment an operator decides whether to proceed.
  it("a dry run counts the credits it would create when matching bookings", async () => {
    await prisma.customer.create({ data: { id: "u", email: "u@test.local", accessTier: "PAID" } });
    const slot = await prisma.flightReviewSlot.create({
      data: { startsAt: plusDays(7), location: "YVR", examinerName: "Pat" },
    });
    await prisma.flightReviewBooking.create({ data: { customerId: "u", slotId: slot.id } });

    const summary = await migrateFlightReviewCredits({ dryRun: true });

    expect(summary).toMatchObject({ granted: 1, bookingsBound: 1, orphanedBookings: [] });
    expect(await prisma.flightReviewCredit.count()).toBe(0);
  });

  it("a dry run still flags a booking no credit would cover", async () => {
    await prisma.customer.create({ data: { id: "free", email: "free@test.local", accessTier: "FREE" } });
    const slot = await prisma.flightReviewSlot.create({
      data: { startsAt: plusDays(7), location: "YVR", examinerName: "Pat" },
    });
    const booking = await prisma.flightReviewBooking.create({
      data: { customerId: "free", slotId: slot.id },
    });

    const summary = await migrateFlightReviewCredits({ dryRun: true });

    expect(summary.orphanedBookings).toEqual([booking.id]);
    expect(summary.bookingsBound).toBe(0);
  });

  // One credit, two bookings: the preview must not hand the same credit out twice.
  it("a dry run does not let two bookings claim one credit", async () => {
    await prisma.customer.create({ data: { id: "u", email: "u@test.local", accessTier: "PAID" } });
    const [a, b] = await Promise.all([
      prisma.flightReviewSlot.create({ data: { startsAt: plusDays(7), location: "YVR", examinerName: "Pat" } }),
      prisma.flightReviewSlot.create({ data: { startsAt: plusDays(8), location: "YVR", examinerName: "Sam" } }),
    ]);
    await prisma.flightReviewBooking.create({ data: { customerId: "u", slotId: a.id } });
    await prisma.flightReviewBooking.create({
      data: { customerId: "u", slotId: b.id, status: "CANCELLED" },
    });

    const summary = await migrateFlightReviewCredits({ dryRun: true });

    expect(summary.bookingsBound).toBe(1);
    expect(summary.orphanedBookings).toHaveLength(1);
  });

  it("reports a booking it cannot fund instead of guessing", async () => {
    await prisma.customer.create({ data: { id: "free", email: "free@test.local", accessTier: "FREE" } });
    const slot = await prisma.flightReviewSlot.create({
      data: { startsAt: plusDays(7), location: "YVR", examinerName: "Pat" },
    });
    const booking = await prisma.flightReviewBooking.create({
      data: { customerId: "free", slotId: slot.id },
    });

    const summary = await migrateFlightReviewCredits();

    expect(summary.orphanedBookings).toEqual([booking.id]);
    expect(summary.bookingsBound).toBe(0);
  });
});
