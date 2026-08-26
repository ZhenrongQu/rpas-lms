import { prisma } from "../db";
import { ADVANCED_BUNDLE_PRODUCT, FLIGHT_REVIEW_PRODUCT } from "./config";
import { getActiveBooking } from "../flightReview/booking";
import { countAvailableCredits, grantCredit, type CreditSource, type Db } from "../flightReview/credits";

export type CheckoutGrant = {
  id: string;
  userId: string;
  paymentIntentId?: string | null;
  customerId?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
};

export async function hasPaidAccess(userId: string): Promise<boolean> {
  const entitlement = await prisma.entitlement.findUnique({
    where: { userId_product: { userId, product: ADVANCED_BUNDLE_PRODUCT } },
    select: { revokedAt: true },
  });
  if (entitlement && !entitlement.revokedAt) return true;

  const user = await prisma.customer.findUnique({
    where: { id: userId },
    select: { accessTier: true },
  });
  return user?.accessTier === "PAID";
}

/**
 * Admin-grants course access (idempotent; un-revokes if needed). Entitlement and
 * the denormalized `accessTier` cache move together — see revoke below for why.
 *
 * Also mints the bundled review credit, exactly as a paid checkout does (U13
 * §13.4). `canBookFlightReview` no longer falls back to `hasPaidAccess`, so
 * without this an admin-granted student would hold the course but could never
 * book the review it includes.
 *
 * The credit is keyed on `source` rather than a payment id — there is no payment
 * here. That is the same idempotency key the one-time migration uses, so the two
 * agree on whether a customer has already been given their bundled credit.
 */
export async function grantPaidAccessEntitlement(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.entitlement.upsert({
      where: { userId_product: { userId, product: ADVANCED_BUNDLE_PRODUCT } },
      create: { userId, product: ADVANCED_BUNDLE_PRODUCT, source: "admin_grant" },
      update: { source: "admin_grant", revokedAt: null },
    });
    await tx.customer.updateMany({ where: { id: userId }, data: { accessTier: "PAID" } });

    const bundled = await tx.flightReviewCredit.findFirst({
      where: { customerId: userId, source: "course_bundle" },
      select: { id: true },
    });
    if (!bundled) await grantCredit(userId, "course_bundle", null, tx);
  });
}

/**
 * Revokes course access (refund, chargeback, admin action). DEF-001 / PRD U5.
 *
 * `hasPaidAccess` is an OR of two sources — the Entitlement row and the
 * denormalized `Customer.accessTier` cache — so clearing only one leaves the
 * user still paid. Both must move in ONE transaction: a partial failure would
 * leave exactly the inconsistent state this decision exists to eliminate.
 *
 * Idempotent: the `revokedAt: null` filter means a second call is a no-op and
 * does not push the original revocation timestamp forward.
 */
export async function revokePaidAccessEntitlement(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.entitlement.updateMany({
      where: { userId, product: ADVANCED_BUNDLE_PRODUCT, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.customer.updateMany({ where: { id: userId }, data: { accessTier: "FREE" } }),
  ]);
}

/**
 * @deprecated Flight Review is a consumable credit, not an entitlement (PRD U13).
 * Kept only so the one-time migration can find pre-credit purchases; no runtime
 * eligibility decision may read it.
 */
export async function hasFlightReviewEntitlement(userId: string): Promise<boolean> {
  const entitlement = await prisma.entitlement.findUnique({
    where: { userId_product: { userId, product: FLIGHT_REVIEW_PRODUCT } },
    select: { revokedAt: true },
  });
  return Boolean(entitlement && !entitlement.revokedAt);
}

/**
 * Eligibility to START a Flight Review booking (PRD U13 §13.1).
 *
 *   canBookFlightReview = has a spendable credit AND has no booking in progress
 *
 * The old model ORed in `hasPaidAccess`, which made the review a permanent perk
 * of owning the course. Under the consumable model a paid student books with the
 * credit their bundle minted, and once it is spent they buy another — so the OR
 * branch is gone. `hasPaidAccess` itself is untouched: courses, exams and the AI
 * assistant still gate on it.
 *
 * This answers "can they book a NEW review", not "can they reschedule": a student
 * with a booking in progress has no spendable credit but may still move it.
 */
export async function canBookFlightReview(userId: string): Promise<boolean> {
  if ((await countAvailableCredits(userId)) === 0) return false;
  return (await getActiveBooking(userId)) === null;
}

/**
 * May this student act on bookings — start a new one, or move the one they hold?
 *
 * Rescheduling spends no credit (PRD U13 §13.4), so holding a booking is its own
 * authorisation. Gating the booking endpoints on `canBookFlightReview` alone
 * would lock a student out of rescheduling the moment their credit went on hold.
 */
export async function canManageFlightReviewBooking(userId: string): Promise<boolean> {
  if (await canBookFlightReview(userId)) return true;
  return (await getActiveBooking(userId)) !== null;
}

/** Admin-grants one review credit. */
export async function grantFlightReviewCredit(userId: string): Promise<void> {
  await grantCredit(userId, "admin_grant");
}

/** Admin-revokes one spendable credit. Returns false when they have none left —
 *  credits already spent on a completed review are not clawed back here. */
export async function revokeFlightReviewCredit(userId: string): Promise<boolean> {
  const credit = await prisma.flightReviewCredit.findFirst({
    where: { customerId: userId, bookingId: null, consumedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!credit) return false;
  await prisma.flightReviewCredit.update({
    where: { id: credit.id },
    data: { revokedAt: new Date() },
  });
  return true;
}

/**
 * Mints one review credit for a checkout, unless this payment already minted one.
 *
 * Stripe redelivers webhooks, and the surrounding Payment upsert is idempotent by
 * design — so the credit grant has to be too, or a retried delivery hands out a
 * free review. `paymentId` is the checkout session id, which is what makes the
 * replay recognisable.
 */
async function grantCreditForPayment(
  userId: string,
  source: CreditSource,
  paymentId: string,
  db: Db,
): Promise<void> {
  const existing = await db.flightReviewCredit.findFirst({
    where: { customerId: userId, paymentId },
    select: { id: true },
  });
  if (!existing) await grantCredit(userId, source, paymentId, db);
}

/**
 * Records a paid Flight Review checkout and mints one review credit. Unlike paid
 * access this does NOT change accessTier — Flight Review is a standalone add-on,
 * not the course bundle.
 */
export async function grantFlightReviewFromCheckout(grant: CheckoutGrant): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.payment.upsert({
      where: { stripeCheckoutSessionId: grant.id },
      create: {
        userId: grant.userId,
        stripeCheckoutSessionId: grant.id,
        stripePaymentIntentId: grant.paymentIntentId ?? null,
        stripeCustomerId: grant.customerId ?? null,
        product: FLIGHT_REVIEW_PRODUCT,
        amountTotal: grant.amountTotal ?? null,
        currency: grant.currency ?? null,
        status: "paid",
      },
      update: {
        stripePaymentIntentId: grant.paymentIntentId ?? null,
        stripeCustomerId: grant.customerId ?? null,
        amountTotal: grant.amountTotal ?? null,
        currency: grant.currency ?? null,
        status: "paid",
      },
    });

    await grantCreditForPayment(grant.userId, "stripe_checkout", grant.id, tx);
  });
}

export async function grantPaidAccessFromCheckout(grant: CheckoutGrant): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.payment.upsert({
      where: { stripeCheckoutSessionId: grant.id },
      create: {
        userId: grant.userId,
        stripeCheckoutSessionId: grant.id,
        stripePaymentIntentId: grant.paymentIntentId ?? null,
        stripeCustomerId: grant.customerId ?? null,
        product: ADVANCED_BUNDLE_PRODUCT,
        amountTotal: grant.amountTotal ?? null,
        currency: grant.currency ?? null,
        status: "paid",
      },
      update: {
        stripePaymentIntentId: grant.paymentIntentId ?? null,
        stripeCustomerId: grant.customerId ?? null,
        amountTotal: grant.amountTotal ?? null,
        currency: grant.currency ?? null,
        status: "paid",
      },
    });

    await tx.entitlement.upsert({
      where: { userId_product: { userId: grant.userId, product: ADVANCED_BUNDLE_PRODUCT } },
      create: {
        userId: grant.userId,
        product: ADVANCED_BUNDLE_PRODUCT,
        source: "stripe_checkout",
      },
      update: {
        source: "stripe_checkout",
        revokedAt: null,
      },
    });

    // U13 §13.4: the course bundle includes one Flight Review, so buying it mints
    // a credit. Without this a paid student would have no way to book at all —
    // canBookFlightReview no longer falls back to hasPaidAccess.
    await grantCreditForPayment(grant.userId, "course_bundle", grant.id, tx);
  });

  // Update Customer.accessTier outside the transaction. Entitlement is the source
  // of truth; this is a denormalized cache.
  await prisma.customer.update({
    where: { id: grant.userId },
    data: {
      accessTier: "PAID",
      ...(grant.customerId ? { stripeCustomerId: grant.customerId } : {}),
    },
  });
}
