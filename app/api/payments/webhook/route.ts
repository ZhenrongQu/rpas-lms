import { Prisma } from "@prisma/client";
import { prisma } from "../../../../src/lib/db";
import {
  PAID_ACCESS_PRODUCT,
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

  try {
    await prisma.webhookEvent.create({ data: { id: event.id, type: event.type } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ received: true }, { status: 200 });
    }
    throw error;
  }

  if (event.type !== "checkout.session.completed") {
    return Response.json({ received: true }, { status: 200 });
  }

  const session = event.data.object as CheckoutSessionLike;
  const userId = session.metadata?.userId;
  const product = session.metadata?.product;
  if (!userId || session.payment_status !== "paid") {
    return Response.json({ received: true }, { status: 200 });
  }

  const grant = {
    id: session.id,
    userId,
    paymentIntentId: idOf(session.payment_intent),
    customerId: idOf(session.customer),
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
  };

  if (product === PAID_ACCESS_PRODUCT) {
    await grantPaidAccessFromCheckout(grant);
  } else if (product === FLIGHT_REVIEW_PRODUCT) {
    await grantFlightReviewFromCheckout(grant);
  }

  return Response.json({ received: true }, { status: 200 });
}
