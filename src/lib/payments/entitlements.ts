import { prisma } from "../db";
import { PAID_ACCESS_PRODUCT } from "./config";

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
    where: { userId_product: { userId, product: PAID_ACCESS_PRODUCT } },
    select: { revokedAt: true },
  });
  if (entitlement && !entitlement.revokedAt) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accessTier: true },
  });
  return user?.accessTier === "PAID";
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
        product: PAID_ACCESS_PRODUCT,
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
      where: { userId_product: { userId: grant.userId, product: PAID_ACCESS_PRODUCT } },
      create: {
        userId: grant.userId,
        product: PAID_ACCESS_PRODUCT,
        source: "stripe_checkout",
      },
      update: {
        source: "stripe_checkout",
        revokedAt: null,
      },
    });

    await tx.user.update({
      where: { id: grant.userId },
      data: {
        accessTier: "PAID",
        stripeCustomerId: grant.customerId ?? undefined,
      },
    });
  });
}
