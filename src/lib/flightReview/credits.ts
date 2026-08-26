import type { Prisma } from "@prisma/client";
import { prisma } from "../db";

/** Where a credit came from. Audit trail for refunds — a `course_bundle` credit
 *  was never paid for on its own, so refunding it is a different conversation. */
export type CreditSource = "stripe_checkout" | "course_bundle" | "admin_grant" | "migration";

export type Db = Prisma.TransactionClient | typeof prisma;

/** A credit is spendable only while it holds no booking and was neither burned
 *  nor refunded. All four state predicates in PRD §13.3 reduce to these columns. */
const AVAILABLE = { bookingId: null, consumedAt: null, revokedAt: null } as const;

/** Mints one review credit. Callers inside a checkout transaction pass `db`. */
export async function grantCredit(
  customerId: string,
  source: CreditSource,
  paymentId: string | null = null,
  db: Db = prisma,
): Promise<string> {
  const credit = await db.flightReviewCredit.create({
    data: { customerId, source, paymentId },
    select: { id: true },
  });
  return credit.id;
}

/** How many credits the customer can spend right now. Drives booking eligibility
 *  and the "you already have N unused credits" purchase warning. */
export async function countAvailableCredits(customerId: string, db: Db = prisma): Promise<number> {
  return db.flightReviewCredit.count({ where: { customerId, ...AVAILABLE } });
}

/**
 * Binds one available credit to `bookingId`. Returns false when the customer has
 * none left.
 *
 * Find-then-update is safe here without extra locking: the partial unique index
 * on (customerId) WHERE status = 'BOOKED' means a customer cannot get two
 * in-progress bookings, so there is no second writer to race for their credits.
 */
export async function holdCreditForBooking(
  customerId: string,
  bookingId: string,
  db: Db,
): Promise<boolean> {
  const credit = await db.flightReviewCredit.findFirst({
    where: { customerId, ...AVAILABLE },
    orderBy: { createdAt: "asc" }, // spend the oldest first
    select: { id: true },
  });
  if (!credit) return false;
  await db.flightReviewCredit.update({ where: { id: credit.id }, data: { bookingId } });
  return true;
}

/** Returns the credit held by a booking to the available pool (cancellation
 *  at least 48h out — see CANCELLATION_REFUND_WINDOW_MS in booking.ts). */
export async function releaseCreditFor(bookingId: string, db: Db): Promise<void> {
  await db.flightReviewCredit.updateMany({ where: { bookingId }, data: { bookingId: null } });
}

/** Burns the credit held by a booking: the review happened, the student no-showed,
 *  or they cancelled too late to get it back. The credit keeps pointing at the
 *  booking, which is what makes "which review did this credit pay for" answerable. */
export async function consumeCreditFor(
  bookingId: string,
  db: Db,
  at: Date = new Date(),
): Promise<void> {
  await db.flightReviewCredit.updateMany({
    where: { bookingId, consumedAt: null },
    data: { consumedAt: at },
  });
}

/** Refund path: takes a credit out of circulation permanently (PRD §13.7). */
export async function revokeCredit(creditId: string, db: Db = prisma, at: Date = new Date()): Promise<void> {
  await db.flightReviewCredit.updateMany({
    where: { id: creditId, revokedAt: null },
    data: { revokedAt: at },
  });
}

/** The customer's spendable credits, oldest first — for the refund review screen. */
export async function listAvailableCredits(customerId: string, db: Db = prisma) {
  return db.flightReviewCredit.findMany({
    where: { customerId, ...AVAILABLE },
    orderBy: { createdAt: "asc" },
  });
}
