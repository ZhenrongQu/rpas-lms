import { prisma } from "../db";
import type { Db } from "./credits";

/**
 * One-time migration to the consumable-credit model (PRD U13 §13.6).
 *
 * `canBookFlightReview` no longer reads entitlements or `accessTier` — only
 * credits. Every customer who already paid therefore has to be issued the credit
 * their purchase bought, or the deploy silently revokes what they own.
 *
 * Idempotent: a customer already holding a credit from a given source is skipped,
 * so a re-run after a partial failure hands out nothing extra.
 */
export type MigrationSummary = {
  granted: number;
  skipped: number;
  bookingsBound: number;
  /** Bookings with no credit available to bind — needs a human. */
  orphanedBookings: string[];
};

type Plan = { customerId: string; source: "migration" | "course_bundle" };

async function planGrants(db: Db): Promise<Plan[]> {
  // Bought Flight Review on its own, or was admin-granted it.
  const standalone = await db.entitlement.findMany({
    where: { product: "flight_review", revokedAt: null },
    select: { userId: true },
  });

  // Owns the course bundle, which now includes one review. A customer matching
  // both rules gets two credits — they did pay twice.
  const bundled = await db.customer.findMany({
    where: {
      OR: [
        { accessTier: "PAID" },
        { entitlements: { some: { product: "paid_access", revokedAt: null } } },
      ],
    },
    select: { id: true },
  });

  return [
    ...standalone.map((e) => ({ customerId: e.userId, source: "migration" as const })),
    ...bundled.map((c) => ({ customerId: c.id, source: "course_bundle" as const })),
  ];
}

export async function migrateFlightReviewCredits(
  options: { dryRun?: boolean; now?: Date; db?: Db } = {},
): Promise<MigrationSummary> {
  const { dryRun = false, now = new Date(), db = prisma } = options;
  const summary: MigrationSummary = { granted: 0, skipped: 0, bookingsBound: 0, orphanedBookings: [] };

  for (const plan of await planGrants(db)) {
    const existing = await db.flightReviewCredit.findFirst({
      where: { customerId: plan.customerId, source: plan.source },
      select: { id: true },
    });
    if (existing) {
      summary.skipped++;
      continue;
    }
    summary.granted++;
    if (!dryRun) {
      await db.flightReviewCredit.create({
        data: { customerId: plan.customerId, source: plan.source },
      });
    }
  }

  // Pre-credit bookings have no status and no credit. A booking row only existed
  // while a booking was active, so one whose slot has already started represents a
  // review that was actually delivered.
  const bookings = await db.flightReviewBooking.findMany({ include: { slot: true, credit: true } });

  for (const booking of bookings) {
    if (booking.credit) continue; // already migrated
    const delivered = booking.slot.startsAt <= now;

    const credit = await db.flightReviewCredit.findFirst({
      where: { customerId: booking.customerId, bookingId: null, consumedAt: null, revokedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!credit) {
      summary.orphanedBookings.push(booking.id);
      continue;
    }

    summary.bookingsBound++;
    if (dryRun) continue;
    await db.flightReviewCredit.update({
      where: { id: credit.id },
      data: { bookingId: booking.id, consumedAt: delivered ? booking.slot.startsAt : null },
    });
    await db.flightReviewBooking.update({
      where: { id: booking.id },
      data: delivered
        ? { status: "COMPLETED", completedAt: booking.slot.startsAt }
        : { status: "BOOKED" },
    });
  }

  return summary;
}
