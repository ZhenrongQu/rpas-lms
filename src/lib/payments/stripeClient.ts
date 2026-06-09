import Stripe from "stripe";
import { getPaymentConfig } from "./config";

type StripeLike = Pick<Stripe, "checkout" | "webhooks">;

let testStripeClient: StripeLike | null = null;

export function getStripeClient(): StripeLike {
  if (testStripeClient) return testStripeClient;
  return new Stripe(getPaymentConfig().stripeSecretKey);
}

export function __setStripeClientForTests(client: StripeLike | null): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test override only");
  testStripeClient = client;
}
