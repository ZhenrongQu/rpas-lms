import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { __setStripeClientForTests } from "../../../../src/lib/payments/stripeClient";
import { POST } from "./route";

describe("POST /api/payments/checkout", () => {
  beforeEach(async () => {
    __setStripeClientForTests(null);
    await prisma.webhookEvent.deleteMany();
    await prisma.flightReviewCredit.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.entitlement.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.customer.create({ data: { id: "u1", email: "u1@test.local", accessTier: "FREE" } });
  });

  it("rejects guests", async () => {
    const res = await POST(new Request("http://test/api/payments/checkout", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("creates a Stripe Checkout Session using server configured price and metadata", async () => {
    const calls: unknown[] = [];
    __setStripeClientForTests({
      checkout: {
        sessions: {
          create: async (params: unknown) => {
            calls.push(params);
            return { url: "https://checkout.stripe.test/session" };
          },
        },
      },
      webhooks: { constructEvent: () => { throw new Error("not used"); } },
    });

    const res = await POST(
      new Request("http://test/api/payments/checkout", {
        method: "POST",
        headers: { "x-test-user-id": "u1" },
        body: JSON.stringify({ locale: "zh", price: "price_client_tamper" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/session" });
    expect(calls).toEqual([
      expect.objectContaining({
        mode: "payment",
        client_reference_id: "u1",
        success_url: "https://rpas.test/zh/billing/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://rpas.test/zh/billing/cancelled",
        metadata: { userId: "u1", product: "paid_access" },
        line_items: [{ price: "price_advanced_bundle_unit", quantity: 1 }],
      }),
    ]);
  });

  it("creates a Flight Review checkout session with its own price and metadata", async () => {
    const calls: unknown[] = [];
    __setStripeClientForTests({
      checkout: {
        sessions: {
          create: async (params: unknown) => {
            calls.push(params);
            return { url: "https://checkout.stripe.test/fr" };
          },
        },
      },
      webhooks: { constructEvent: () => { throw new Error("not used"); } },
    });

    const res = await POST(
      new Request("http://test/api/payments/checkout", {
        method: "POST",
        headers: { "x-test-user-id": "u1" },
        body: JSON.stringify({ locale: "en", product: "flight_review" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/fr", availableCredits: 0 });
    expect(calls).toEqual([
      expect.objectContaining({
        metadata: { userId: "u1", product: "flight_review" },
        line_items: [{ price: "price_flight_review_unit", quantity: 1 }],
        success_url: "https://rpas.test/en/billing/success?session_id={CHECKOUT_SESSION_ID}",
      }),
    ]);
  });

  // PRD U13 §13.5. The course is a permanent unlock, so buying it twice is always
  // a mistake. Flight Review is consumable, so buying a second one is legitimate —
  // the warning exists to stop an accidental repurchase, not to block a real one.
  describe("repeat purchases", () => {
    function stripeReturning(url: string) {
      __setStripeClientForTests({
        checkout: { sessions: { create: async () => ({ url }) } },
        webhooks: { constructEvent: () => { throw new Error("not used"); } },
      });
    }

    const checkout = (product?: string) =>
      POST(
        new Request("http://test/api/payments/checkout", {
          method: "POST",
          headers: { "x-test-user-id": "u1" },
          body: JSON.stringify(product ? { locale: "en", product } : { locale: "en" }),
        }),
      );

    it("blocks a second purchase of the course before reaching Stripe", async () => {
      let created = 0;
      __setStripeClientForTests({
        checkout: { sessions: { create: async () => { created++; return { url: "x" }; } } },
        webhooks: { constructEvent: () => { throw new Error("not used"); } },
      });
      await prisma.customer.update({ where: { id: "u1" }, data: { accessTier: "PAID" } });

      const res = await checkout("paid_access");

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "already_owned" });
      expect(created).toBe(0);
    });

    it("still sells a second Flight Review, but says how many are unused", async () => {
      stripeReturning("https://checkout.stripe.test/fr");
      await prisma.flightReviewCredit.create({
        data: { customerId: "u1", source: "stripe_checkout" },
      });

      const res = await checkout("flight_review");

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        url: "https://checkout.stripe.test/fr",
        availableCredits: 1,
      });
    });

    it("reports no unused credits when there are none", async () => {
      stripeReturning("https://checkout.stripe.test/fr");

      const res = await checkout("flight_review");

      expect(await res.json()).toEqual({
        url: "https://checkout.stripe.test/fr",
        availableCredits: 0,
      });
    });
  });
});
