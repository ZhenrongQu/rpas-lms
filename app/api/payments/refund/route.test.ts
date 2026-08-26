import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { GET, POST } from "./route";

const USER = "refund-route-user";

function req(method: string, body?: unknown, userId: string | null = USER): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["x-test-user-id"] = userId;
  return new Request("http://test/api/payments/refund", {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function reset() {
  await prisma.refundRequest.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.customer.deleteMany({ where: { id: USER } });
}

async function seedPayment(): Promise<string> {
  const payment = await prisma.payment.create({
    data: {
      userId: USER,
      stripeCheckoutSessionId: "cs_route",
      stripePaymentIntentId: "pi_route",
      product: "paid_access",
      amountTotal: 9900,
      currency: "cad",
      status: "paid",
    },
  });
  return payment.id;
}

describe("/api/payments/refund", () => {
  beforeEach(async () => {
    await reset();
    await prisma.customer.create({ data: { id: USER, email: "rr@test.local", accessTier: "PAID" } });
  });
  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("401s a guest on both verbs", async () => {
    expect((await GET(req("GET", undefined, null))).status).toBe(401);
    expect((await POST(req("POST", { paymentId: "x", reason: "y" }, null))).status).toBe(401);
  });

  it("lists the caller's payments with their refund state", async () => {
    const paymentId = await seedPayment();

    const body = (await (await GET(req("GET"))).json()) as {
      payments: Array<{ id: string; refundStatus: string | null }>;
    };

    expect(body.payments).toHaveLength(1);
    expect(body.payments[0]).toMatchObject({ id: paymentId, refundStatus: null });
  });

  it("files a request and reflects it in the listing", async () => {
    const paymentId = await seedPayment();

    const res = await POST(req("POST", { paymentId, reason: "changed my mind" }));

    expect(res.status).toBe(201);
    const body = (await (await GET(req("GET"))).json()) as {
      payments: Array<{ refundStatus: string | null }>;
    };
    expect(body.payments[0].refundStatus).toBe("PENDING");
  });

  it("409s a second request for the same payment", async () => {
    const paymentId = await seedPayment();
    await POST(req("POST", { paymentId, reason: "first" }));

    expect((await POST(req("POST", { paymentId, reason: "again" }))).status).toBe(409);
  });

  it("404s a payment that belongs to someone else", async () => {
    await prisma.customer.create({ data: { id: "stranger", email: "stranger@test.local" } });
    const paymentId = await seedPayment();

    const res = await POST(req("POST", { paymentId, reason: "not mine" }, "stranger"));

    expect(res.status).toBe(404);
    await prisma.customer.delete({ where: { id: "stranger" } });
  });

  it("422s a malformed body", async () => {
    expect((await POST(req("POST", { paymentId: "" }))).status).toBe(422);
  });
});
