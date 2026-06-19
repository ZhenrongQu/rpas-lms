import { Prisma } from "@prisma/client";
import { prisma } from "../../../../src/lib/db";
import {
  ADVANCED_BUNDLE_PRODUCT,
  FLIGHT_REVIEW_PRODUCT,
  getPaymentConfig,
} from "../../../../src/lib/payments/config";
import {
  grantPaidAccessFromCheckout,
  grantFlightReviewFromCheckout,
} from "../../../../src/lib/payments/entitlements";
import { getStripeClient } from "../../../../src/lib/payments/stripeClient";

type CheckoutSessionLike = {
  id: string;
  payment_status?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: string | { id: string } | null;
  customer?: string | { id: string } | null;
  amount_total?: number | null;
  currency?: string | null;
};

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export async function POST(req: Request): Promise<Response> {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing signature" }, { status: 400 });

  let event: { id: string; type: string; data: { object: unknown } };
  try {
    event = getStripeClient().webhooks.constructEvent(
      payload,
      signature,
      getPaymentConfig().webhookSecret,
    ) as { id: string; type: string; data: { object: unknown } };
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  // P1-3: idempotency without losing grants on failure. A WebhookEvent row means
  // "fully processed" and is written ONLY after the grant below succeeds. If we
  // recorded it up front (as before) and the grant then threw, Stripe's retry
  // would hit the dedup short-circuit and 200 without ever granting — the user
  // pays but never unlocks. By granting first, any failure throws (→ 500, no
  // row) and the retry re-runs the grant, which is idempotent (upserts keyed by
  // checkout session / entitlement), so re-processing a duplicate is harmless.
  const already = await prisma.webhookEvent.findUnique({
    where: { id: event.id },
    select: { id: true },
  });
  if (already) return Response.json({ received: true }, { status: 200 });

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as CheckoutSessionLike;
    const userId = session.metadata?.userId;
    const product = session.metadata?.product;

    if (userId && session.payment_status === "paid") {
      const grant = {
        id: session.id,
        userId,
        paymentIntentId: idOf(session.payment_intent),
        customerId: idOf(session.customer),
        amountTotal: session.amount_total ?? null,
        currency: session.currency ?? null,
      };

      if (product === ADVANCED_BUNDLE_PRODUCT) {
        await grantPaidAccessFromCheckout(grant);
      } else if (product === FLIGHT_REVIEW_PRODUCT) {
        await grantFlightReviewFromCheckout(grant);
      }
    }
  }

  // Grant (if any) succeeded — now mark the event processed so retries no-op.
  // A concurrent duplicate delivery may also have processed it; swallow the
  // unique-violation in that case (the grant ran idempotently either way).
  try {
    await prisma.webhookEvent.create({ data: { id: event.id, type: event.type } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      throw error;
    }
  }

  return Response.json({ received: true }, { status: 200 });
}
