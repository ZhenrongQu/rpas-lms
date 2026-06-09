import Stripe from "stripe";
import { getPaymentConfig } from "./config";

type StripeLike = {
  checkout: {
    sessions: {
      create: (params: Stripe.Checkout.SessionCreateParams) => Promise<{ url: string | null }>;
    };
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

export function __setStripeClientForTests(client: StripeLike | null): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test override only");
  testStripeClient = client;
}
