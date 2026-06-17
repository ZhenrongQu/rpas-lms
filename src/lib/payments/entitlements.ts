import { prisma } from "../db";
import { ADVANCED_BUNDLE_PRODUCT, FLIGHT_REVIEW_PRODUCT } from "./config";

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

/** True when the user holds an active (not revoked) flight_review entitlement. */
export async function hasFlightReviewEntitlement(userId: string): Promise<boolean> {
  const entitlement = await prisma.entitlement.findUnique({
    where: { userId_product: { userId, product: FLIGHT_REVIEW_PRODUCT } },
    select: { revokedAt: true },
  });
  return Boolean(entitlement && !entitlement.revokedAt);
}

/**
 * Eligibility to book a Flight Review: the student must hold the flight_review
 * entitlement, which they get by purchasing the Flight Review product or via an
 * admin grant. Single source of truth for the dashboard, booking page, and every
 * booking API.
 */
export async function canBookFlightReview(userId: string): Promise<boolean> {
  return hasFlightReviewEntitlement(userId);
}

/** Admin-grants the flight_review entitlement (idempotent; un-revokes if needed). */
export async function grantFlightReviewEntitlement(userId: string): Promise<void> {
  await prisma.entitlement.upsert({
    where: { userId_product: { userId, product: FLIGHT_REVIEW_PRODUCT } },
    create: { userId, product: FLIGHT_REVIEW_PRODUCT, source: "admin_grant" },
    update: { source: "admin_grant", revokedAt: null },
  });
}

/** Admin-revokes the flight_review entitlement (no-op if it doesn't exist). */
export async function revokeFlightReviewEntitlement(userId: string): Promise<void> {
  await prisma.entitlement.updateMany({
    where: { userId, product: FLIGHT_REVIEW_PRODUCT, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Records a paid Flight Review checkout and grants the flight_review entitlement.
 * Unlike paid access this does NOT change accessTier — Flight Review is a
 * standalone add-on, not the course bundle.
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

    await tx.entitlement.upsert({
      where: { userId_product: { userId: grant.userId, product: FLIGHT_REVIEW_PRODUCT } },
      create: { userId: grant.userId, product: FLIGHT_REVIEW_PRODUCT, source: "stripe_checkout" },
      update: { source: "stripe_checkout", revokedAt: null },
    });
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
