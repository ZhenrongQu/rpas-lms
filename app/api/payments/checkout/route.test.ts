import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { __setStripeClientForTests } from "../../../../src/lib/payments/stripeClient";
import { POST } from "./route";

describe("POST /api/payments/checkout", () => {
  beforeEach(async () => {
    __setStripeClientForTests(null);
    await prisma.webhookEvent.deleteMany();
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
        line_items: [{ price: "price_paid_access_unit", quantity: 1 }],
      }),
    ]);
  });
});
