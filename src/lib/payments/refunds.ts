import { prisma } from "../db";
import { ADVANCED_BUNDLE_PRODUCT, FLIGHT_REVIEW_PRODUCT } from "./config";
import { revokePaidAccessEntitlement } from "./entitlements";
import { getStripeClient } from "./stripeClient";
import { cancelBooking } from "../flightReview/booking";
import { revokeCredit } from "../flightReview/credits";

export type RefundStatus = "PENDING" | "APPROVED" | "REJECTED" | "REFUNDING" | "REFUNDED";

export type RequestRefundResult =
  | { ok: true; requestId: string }
  | { ok: false; error: "payment_not_found" | "already_requested" };

/**
 * Files a refund request against one of the customer's payments (PRD U5).
 *
 * Filing does not move money or touch access — a human approves first, because
 * only a person can weigh whether what is being refunded was already delivered.
 */
export async function requestRefund(
  userId: string,
  paymentId: string,
  reason: string,
): Promise<RequestRefundResult> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, userId },
    select: { id: true },
  });
  if (!payment) return { ok: false, error: "payment_not_found" };

  const open = await prisma.refundRequest.findFirst({
    where: { paymentId, status: { in: ["PENDING", "APPROVED", "REFUNDING"] } },
    select: { id: true },
  });
  if (open) return { ok: false, error: "already_requested" };

  const created = await prisma.refundRequest.create({
    data: { userId, paymentId, reason },
    select: { id: true },
  });
  return { ok: true, requestId: created.id };
}

export type RefundReviewItem = {
  id: string;
  status: string;
  reason: string;
  adminNote: string | null;
  createdAt: Date;
  customerEmail: string | null;
  product: string;
  amountTotal: number | null;
  currency: string | null;
  /**
   * True when the Flight Review credit this payment bought has already been
   * burned — the appointment happened. PRD §13.7 leaves the call to the admin
   * rather than auto-rejecting, so this is surfaced, not enforced.
   */
  creditConsumed: boolean;
};

/** Computed live rather than snapshotted: the admin decides at review time, and
 *  a credit can be spent between filing and review. */
export async function listRefundRequests(status?: RefundStatus): Promise<RefundReviewItem[]> {
  const rows = await prisma.refundRequest.findMany({
    where: status ? { status } : undefined,
    include: { payment: true, user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const consumed = new Set(
    (
      await prisma.flightReviewCredit.findMany({
        where: {
          paymentId: { in: rows.map((r) => r.payment.stripeCheckoutSessionId) },
          consumedAt: { not: null },
        },
        select: { paymentId: true },
      })
    ).map((c) => c.paymentId as string),
  );

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    reason: r.reason,
    adminNote: r.adminNote,
    createdAt: r.createdAt,
    customerEmail: r.user.email,
    product: r.payment.product,
    amountTotal: r.payment.amountTotal,
    currency: r.payment.currency,
    creditConsumed: consumed.has(r.payment.stripeCheckoutSessionId),
  }));
}

/**
 * Withdraws whatever the payment bought.
 *
 * Only called once the money is actually back — never on `pending`. Revoking on
 * an unfinished refund would take access away from someone who may still end up
 * paying for it.
 */
export async function revokeAccessForPayment(
  userId: string,
  product: string,
  checkoutSessionId: string,
): Promise<void> {
  if (product === ADVANCED_BUNDLE_PRODUCT) {
    await revokePaidAccessEntitlement(userId);
    return;
  }
  if (product !== FLIGHT_REVIEW_PRODUCT) return;

  const credit = await prisma.flightReviewCredit.findFirst({
    where: { customerId: userId, paymentId: checkoutSessionId, revokedAt: null },
    select: { id: true, bookingId: true, consumedAt: true },
  });
  if (!credit) return;

  // A credit still held by a booking must release its slot first, or the slot
  // stays blocked for a review nobody is paying for any more (PRD §13.7).
  if (credit.bookingId && !credit.consumedAt) await cancelBooking(userId);
  await revokeCredit(credit.id);
}

export type ApproveResult =
  | { ok: true; status: "REFUNDED" | "REFUNDING" }
  | { ok: false; error: "not_pending" | "no_payment_intent" };

/**
 * Approves a request and asks Stripe for the money back.
 *
 * Stripe usually answers `succeeded` synchronously, in which case access is
 * withdrawn in the same action. Some payment methods answer `pending`; then the
 * request parks in REFUNDING and the `charge.refunded` webhook finishes it. That
 * webhook is also the safety net for an admin whose browser died mid-approval.
 */
export async function approveRefund(requestId: string, adminNote?: string): Promise<ApproveResult> {
  const request = await prisma.refundRequest.findUnique({
    where: { id: requestId },
    include: { payment: true },
  });
  if (!request || request.status !== "PENDING") return { ok: false, error: "not_pending" };
  if (!request.payment.stripePaymentIntentId) return { ok: false, error: "no_payment_intent" };

  const refund = (await getStripeClient().refunds.create({
    payment_intent: request.payment.stripePaymentIntentId,
  })) as { status?: string | null };

  const settled = refund.status === "succeeded";
  const status: "REFUNDED" | "REFUNDING" = settled ? "REFUNDED" : "REFUNDING";

  await prisma.refundRequest.update({
    where: { id: requestId },
    data: { status, adminNote: adminNote ?? null, decidedAt: new Date() },
  });

  if (settled) {
    await revokeAccessForPayment(
      request.userId,
      request.payment.product,
      request.payment.stripeCheckoutSessionId,
    );
  }
  return { ok: true, status };
}

export async function rejectRefund(requestId: string, adminNote?: string): Promise<boolean> {
  const { count } = await prisma.refundRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "REJECTED", adminNote: adminNote ?? null, decidedAt: new Date() },
  });
  return count === 1;
}

/**
 * Finishes a refund from Stripe's side (`charge.refunded`).
 *
 * Idempotent and safe to arrive first: a refund issued straight from the Stripe
 * dashboard has no request behind it, and access still has to be withdrawn.
 */
export async function settleRefundFromStripe(paymentIntentId: string): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  if (!payment) return;

  await prisma.refundRequest.updateMany({
    where: { paymentId: payment.id, status: { in: ["PENDING", "APPROVED", "REFUNDING"] } },
    data: { status: "REFUNDED", decidedAt: new Date() },
  });
  await prisma.payment.update({ where: { id: payment.id }, data: { status: "refunded" } });
  await revokeAccessForPayment(payment.userId, payment.product, payment.stripeCheckoutSessionId);
}

/**
 * Records a chargeback as a request needing review (`charge.dispute.created`).
 *
 * A disputing customer never files through the app, so without this the money
 * leaves and access stays. Left PENDING rather than auto-revoked: a dispute can
 * be won, and access should not vanish while it is still contested.
 */
export async function recordDispute(paymentIntentId: string): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true, userId: true },
  });
  if (!payment) return;

  const open = await prisma.refundRequest.findFirst({
    where: { paymentId: payment.id, status: { in: ["PENDING", "APPROVED", "REFUNDING"] } },
    select: { id: true },
  });
  if (open) return;

  await prisma.refundRequest.create({
    data: { userId: payment.userId, paymentId: payment.id, reason: "dispute" },
  });
}
