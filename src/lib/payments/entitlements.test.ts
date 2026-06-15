import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  canBookFlightReview,
  grantFlightReviewEntitlement,
  grantPaidAccessFromCheckout,
  hasPaidAccess,
  revokeFlightReviewEntitlement,
} from "./entitlements";

describe("payment entitlements", () => {
  beforeEach(async () => {
    await prisma.webhookEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.entitlement.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("returns false for free users and true for paid users", async () => {
    await prisma.customer.create({ data: { id: "u1", email: "u1@test.local", accessTier: "FREE" } });
    await prisma.customer.create({ data: { id: "u2", email: "u2@test.local", accessTier: "PAID" } });
    expect(await hasPaidAccess("u1")).toBe(false);
    expect(await hasPaidAccess("u2")).toBe(true);
  });

  it("grants paid access from a completed checkout session", async () => {
    await prisma.customer.create({ data: { id: "u1", email: "u1@test.local", accessTier: "FREE" } });
    await grantPaidAccessFromCheckout({
      id: "cs_test_1",
      userId: "u1",
      paymentIntentId: "pi_1",
      customerId: "cus_1",
      amountTotal: 9900,
      currency: "cad",
    });

    expect(await hasPaidAccess("u1")).toBe(true);
    const user = await prisma.customer.findUniqueOrThrow({ where: { id: "u1" } });
    expect(user.accessTier).toBe("PAID");
    expect(user.stripeCustomerId).toBe("cus_1");
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.entitlement.count()).toBe(1);
  });
});

describe("flight review eligibility", () => {
  beforeEach(async () => {
    await prisma.entitlement.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("is eligible with the flight_review entitlement, regardless of tier", async () => {
    await prisma.customer.create({ data: { id: "free", email: "free@test.local", accessTier: "FREE" } });
    await prisma.customer.create({ data: { id: "paid", email: "paid@test.local", accessTier: "PAID" } });

    // No flight_review entitlement → not eligible, even for a PAID user.
    expect(await canBookFlightReview("free")).toBe(false);
    expect(await canBookFlightReview("paid")).toBe(false);

    // The flight_review entitlement alone unlocks booking (it's its own product).
    await grantFlightReviewEntitlement("free");
    expect(await canBookFlightReview("free")).toBe(true);
  });

  it("revoking flight_review removes eligibility", async () => {
    await prisma.customer.create({ data: { id: "paid", email: "paid@test.local", accessTier: "PAID" } });
    await grantFlightReviewEntitlement("paid");
    expect(await canBookFlightReview("paid")).toBe(true);

    await revokeFlightReviewEntitlement("paid");
    expect(await canBookFlightReview("paid")).toBe(false);
  });
});
