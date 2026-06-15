import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { __setStripeClientForTests } from "../../../../src/lib/payments/stripeClient";
import { POST } from "./route";

const completedEvent = {
  id: "evt_1",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_1",
      payment_status: "paid",
      metadata: { userId: "u1", product: "paid_access" },
      payment_intent: "pi_1",
      customer: "cus_1",
      amount_total: 9900,
      currency: "cad",
    },
  },
};

describe("POST /api/payments/webhook", () => {
  beforeEach(async () => {
    __setStripeClientForTests(null);
    await prisma.webhookEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.entitlement.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.customer.create({ data: { id: "u1", email: "u1@test.local", accessTier: "FREE" } });
  });

  it("rejects invalid signatures", async () => {
    __setStripeClientForTests({
      checkout: { sessions: { create: async () => ({ url: "" }) } },
      webhooks: { constructEvent: () => { throw new Error("bad signature"); } },
    });
    const res = await POST(new Request("http://test/api/payments/webhook", {
      method: "POST",
      headers: { "stripe-signature": "bad" },
      body: "{}",
    }));
    expect(res.status).toBe(400);
  });

  it("grants paid access for completed checkout sessions and is idempotent", async () => {
    __setStripeClientForTests({
      checkout: { sessions: { create: async () => ({ url: "" }) } },
      webhooks: { constructEvent: () => completedEvent },
    });

    const request = () => new Request("http://test/api/payments/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: JSON.stringify(completedEvent),
    });

    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);

    const user = await prisma.customer.findUniqueOrThrow({ where: { id: "u1" } });
    expect(user.accessTier).toBe("PAID");
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.entitlement.count()).toBe(1);
  });

  it("grants the flight_review entitlement without changing access tier", async () => {
    const flightReviewEvent = {
      id: "evt_fr",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_fr",
          payment_status: "paid",
          metadata: { userId: "u1", product: "flight_review" },
          payment_intent: "pi_fr",
          customer: "cus_1",
          amount_total: 5000,
          currency: "cad",
        },
      },
    };
    __setStripeClientForTests({
      checkout: { sessions: { create: async () => ({ url: "" }) } },
      webhooks: { constructEvent: () => flightReviewEvent },
    });

    const res = await POST(new Request("http://test/api/payments/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: JSON.stringify(flightReviewEvent),
    }));
    expect(res.status).toBe(200);

    const user = await prisma.customer.findUniqueOrThrow({ where: { id: "u1" } });
    expect(user.accessTier).toBe("FREE"); // unchanged — Flight Review is an add-on
    const entitlement = await prisma.entitlement.findUnique({
      where: { userId_product: { userId: "u1", product: "flight_review" } },
    });
    expect(entitlement).not.toBeNull();
  });
});
