import Stripe from "stripe";
import { getPaymentConfig } from "./config";

type StripeLike = {
  checkout: {
    sessions: {
      create: (params: Stripe.Checkout.SessionCreateParams) => Promise<{ url: string | null }>;
    };
  };
  refunds: {
    create: (params: Stripe.RefundCreateParams) => Promise<{ id?: string; status?: string | null }>;
  };
  webhooks: {
    constructEvent: (payload: string, signature: string, secret: string) => unknown;
  };
};

let testStripeClient: StripeLike | null = null;

export function getStripeClient(): StripeLike {
  if (testStripeClient) return testStripeClient;
  return new Stripe(getPaymentConfig().stripeSecretKey);
}

/** Test doubles stub only the surface the case under test touches, so this takes
 *  a Partial — a checkout test should not have to invent a refunds stub. */
export function __setStripeClientForTests(client: Partial<StripeLike> | null): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test override only");
  testStripeClient = client as StripeLike | null;
}
