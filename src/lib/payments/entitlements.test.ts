import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  canBookFlightReview,
  grantFlightReviewCredit,
  grantFlightReviewFromCheckout,
  grantPaidAccessEntitlement,
  grantPaidAccessFromCheckout,
  hasPaidAccess,
  revokeFlightReviewCredit,
  revokePaidAccessEntitlement,
} from "./entitlements";
import { countAvailableCredits } from "../flightReview/credits";

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

// DEF-001 / PRD U5: paid_access had no revocation path — a refunded customer kept
// course access forever. Revocation must clear BOTH sides of `hasPaidAccess`
// (the Entitlement row AND the denormalized accessTier cache) in one transaction.
describe("paid access revocation", () => {
  beforeEach(async () => {
    await prisma.webhookEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.entitlement.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("revokes the entitlement and resets accessTier to FREE", async () => {
    await prisma.customer.create({ data: { id: "u1", email: "u1@test.local", accessTier: "FREE" } });
    await grantPaidAccessFromCheckout({ id: "cs_test_1", userId: "u1" });
    expect(await hasPaidAccess("u1")).toBe(true);

    await revokePaidAccessEntitlement("u1");

    expect(await hasPaidAccess("u1")).toBe(false);
    const user = await prisma.customer.findUniqueOrThrow({ where: { id: "u1" } });
    expect(user.accessTier).toBe("FREE");
    const ent = await prisma.entitlement.findFirstOrThrow({ where: { userId: "u1" } });
    expect(ent.revokedAt).not.toBeNull();
  });

  it("resets a legacy PAID user that has no entitlement row", async () => {
    await prisma.customer.create({ data: { id: "u2", email: "u2@test.local", accessTier: "PAID" } });
    expect(await hasPaidAccess("u2")).toBe(true);

    await revokePaidAccessEntitlement("u2");

    expect(await hasPaidAccess("u2")).toBe(false);
    const user = await prisma.customer.findUniqueOrThrow({ where: { id: "u2" } });
    expect(user.accessTier).toBe("FREE");
  });

  it("is idempotent — a second revoke neither throws nor moves revokedAt", async () => {
    await prisma.customer.create({ data: { id: "u3", email: "u3@test.local", accessTier: "FREE" } });
    await grantPaidAccessFromCheckout({ id: "cs_test_3", userId: "u3" });

    await revokePaidAccessEntitlement("u3");
    const first = await prisma.entitlement.findFirstOrThrow({ where: { userId: "u3" } });

    await revokePaidAccessEntitlement("u3");
    const second = await prisma.entitlement.findFirstOrThrow({ where: { userId: "u3" } });

    expect(second.revokedAt).toEqual(first.revokedAt);
    expect(await hasPaidAccess("u3")).toBe(false);
  });

  it("an admin grant re-unlocks a previously revoked customer", async () => {
    await prisma.customer.create({ data: { id: "u4", email: "u4@test.local", accessTier: "FREE" } });
    await grantPaidAccessEntitlement("u4");
    expect(await hasPaidAccess("u4")).toBe(true);

    await revokePaidAccessEntitlement("u4");
    expect(await hasPaidAccess("u4")).toBe(false);

    await grantPaidAccessEntitlement("u4");
    expect(await hasPaidAccess("u4")).toBe(true);
    const user = await prisma.customer.findUniqueOrThrow({ where: { id: "u4" } });
    expect(user.accessTier).toBe("PAID");
  });
});

// PRD U13: Flight Review stopped being an entitlement and became a consumable
// credit. The old `canBookFlightReview = flight_review entitlement OR paid access`
// made the review a permanent perk of owning the course; now a paid student books
// with the credit their bundle minted, and buys another once it is spent.
describe("flight review eligibility runs on credits", () => {
  beforeEach(async () => {
    await prisma.flightReviewCredit.deleteMany();
    await prisma.flightReviewBooking.deleteMany();
    await prisma.flightReviewSlot.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.entitlement.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("paid course access alone no longer unlocks booking", async () => {
    await prisma.customer.create({ data: { id: "paid", email: "paid@test.local", accessTier: "PAID" } });
    expect(await hasPaidAccess("paid")).toBe(true);
    expect(await canBookFlightReview("paid")).toBe(false);
  });

  it("a credit unlocks booking for a FREE user", async () => {
    await prisma.customer.create({ data: { id: "free", email: "free@test.local", accessTier: "FREE" } });
    expect(await canBookFlightReview("free")).toBe(false);

    await grantFlightReviewCredit("free");

    expect(await canBookFlightReview("free")).toBe(true);
  });

  it("buying the course bundle mints one review credit", async () => {
    await prisma.customer.create({ data: { id: "u1", email: "u1@test.local", accessTier: "FREE" } });

    await grantPaidAccessFromCheckout({ id: "cs_bundle_1", userId: "u1" });

    expect(await countAvailableCredits("u1")).toBe(1);
    expect(await canBookFlightReview("u1")).toBe(true);
  });

  it("buying Flight Review on its own mints a credit without touching accessTier", async () => {
    await prisma.customer.create({ data: { id: "u2", email: "u2@test.local", accessTier: "FREE" } });

    await grantFlightReviewFromCheckout({ id: "cs_fr_1", userId: "u2" });

    expect(await countAvailableCredits("u2")).toBe(1);
    const user = await prisma.customer.findUniqueOrThrow({ where: { id: "u2" } });
    expect(user.accessTier).toBe("FREE");
  });

  it("a redelivered webhook does not hand out a second credit", async () => {
    await prisma.customer.create({ data: { id: "u3", email: "u3@test.local", accessTier: "FREE" } });

    await grantPaidAccessFromCheckout({ id: "cs_replay", userId: "u3" });
    await grantPaidAccessFromCheckout({ id: "cs_replay", userId: "u3" });

    expect(await countAvailableCredits("u3")).toBe(1);
  });

  it("two separate purchases mint two credits", async () => {
    await prisma.customer.create({ data: { id: "u4", email: "u4@test.local", accessTier: "FREE" } });

    await grantPaidAccessFromCheckout({ id: "cs_a", userId: "u4" });
    await grantFlightReviewFromCheckout({ id: "cs_b", userId: "u4" });

    expect(await countAvailableCredits("u4")).toBe(2);
  });

  it("an admin can revoke a spendable credit, and says so when there is none", async () => {
    await prisma.customer.create({ data: { id: "u5", email: "u5@test.local", accessTier: "FREE" } });
    await grantFlightReviewCredit("u5");

    expect(await revokeFlightReviewCredit("u5")).toBe(true);
    expect(await canBookFlightReview("u5")).toBe(false);
    expect(await revokeFlightReviewCredit("u5")).toBe(false);
  });

  it("a student holding a booking cannot start a second one", async () => {
    await prisma.customer.create({ data: { id: "u6", email: "u6@test.local", accessTier: "FREE" } });
    await grantFlightReviewCredit("u6");
    await grantFlightReviewCredit("u6"); // two credits, so only the booking can block them
    const slot = await prisma.flightReviewSlot.create({
      data: { startsAt: new Date(Date.now() + 7 * 86_400_000), location: "YVR", examinerName: "Pat" },
    });
    await prisma.flightReviewBooking.create({ data: { customerId: "u6", slotId: slot.id } });

    expect(await countAvailableCredits("u6")).toBe(2);
    expect(await canBookFlightReview("u6")).toBe(false);
  });
});
