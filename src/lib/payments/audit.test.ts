import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { auditEntitlementConsistency } from "./audit";
import { grantPaidAccessEntitlement, revokePaidAccessEntitlement } from "./entitlements";

async function reset() {
  await prisma.entitlement.deleteMany();
  await prisma.customer.deleteMany();
}

describe("entitlement / accessTier consistency audit (PRD U5)", () => {
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("reports a PAID tier with no live entitlement — the DEF-001 residue", async () => {
    await prisma.customer.create({ data: { id: "u1", email: "u1@test.local", accessTier: "PAID" } });

    const drift = await auditEntitlementConsistency();

    expect(drift).toEqual([
      { userId: "u1", email: "u1@test.local", accessTier: "PAID", kind: "tier_without_entitlement" },
    ]);
  });

  it("reports a live entitlement whose tier was never updated", async () => {
    await prisma.customer.create({ data: { id: "u2", email: "u2@test.local", accessTier: "FREE" } });
    await prisma.entitlement.create({
      data: { userId: "u2", product: "paid_access", source: "stripe_checkout" },
    });

    const drift = await auditEntitlementConsistency();

    expect(drift).toEqual([
      { userId: "u2", email: "u2@test.local", accessTier: "FREE", kind: "entitlement_without_tier" },
    ]);
  });

  it("stays silent for consistent customers, paid and free alike", async () => {
    await prisma.customer.create({ data: { id: "paid", email: "paid@test.local", accessTier: "FREE" } });
    await grantPaidAccessEntitlement("paid");
    await prisma.customer.create({ data: { id: "free", email: "free@test.local", accessTier: "FREE" } });

    expect(await auditEntitlementConsistency()).toEqual([]);
  });

  it("finds nothing after a transactional revoke — the audit and the fix agree", async () => {
    await prisma.customer.create({ data: { id: "u3", email: "u3@test.local", accessTier: "FREE" } });
    await grantPaidAccessEntitlement("u3");
    await revokePaidAccessEntitlement("u3");

    expect(await auditEntitlementConsistency()).toEqual([]);
  });

  it("does not treat a revoked entitlement on a FREE customer as drift", async () => {
    await prisma.customer.create({ data: { id: "u4", email: "u4@test.local", accessTier: "FREE" } });
    await prisma.entitlement.create({
      data: {
        userId: "u4",
        product: "paid_access",
        source: "stripe_checkout",
        revokedAt: new Date(),
      },
    });

    expect(await auditEntitlementConsistency()).toEqual([]);
  });
});
