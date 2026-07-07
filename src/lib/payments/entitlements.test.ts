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

  it("unlocks via the flight_review entitlement OR paid access", async () => {
    await prisma.customer.create({ data: { id: "free", email: "free@test.local", accessTier: "FREE" } });
    await prisma.customer.create({ data: { id: "paid", email: "paid@test.local", accessTier: "PAID" } });

    // FREE user with no entitlement → not eligible.
    expect(await canBookFlightReview("free")).toBe(false);
    // Paid access alone unlocks booking (the review is bundled in for paid students).
    expect(await canBookFlightReview("paid")).toBe(true);

    // The standalone flight_review entitlement unlocks it for a FREE user too.
    await grantFlightReviewEntitlement("free");
    expect(await canBookFlightReview("free")).toBe(true);
  });

  it("a FREE user loses eligibility when flight_review is revoked", async () => {
    await prisma.customer.create({ data: { id: "free", email: "free@test.local", accessTier: "FREE" } });
    await grantFlightReviewEntitlement("free");
    expect(await canBookFlightReview("free")).toBe(true);

    await revokeFlightReviewEntitlement("free");
    expect(await canBookFlightReview("free")).toBe(false);
  });

  it("a PAID user stays eligible even without the standalone flight_review entitlement", async () => {
    await prisma.customer.create({ data: { id: "paid", email: "paid@test.local", accessTier: "PAID" } });
    expect(await canBookFlightReview("paid")).toBe(true);

    // Revoking the standalone entitlement (a no-op here) doesn't remove paid access.
    await revokeFlightReviewEntitlement("paid");
    expect(await canBookFlightReview("paid")).toBe(true);
  });
});
