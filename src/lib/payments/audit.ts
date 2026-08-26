import { prisma } from "../db";
import { ADVANCED_BUNDLE_PRODUCT } from "./config";

/**
 * `Customer.accessTier` is a denormalized cache of the Entitlement table, and
 * `hasPaidAccess` ORs the two together — so a drift between them is invisible in
 * normal use and only shows up as the wrong answer at the wrong moment:
 *
 *   tier_without_entitlement — reads as paid on the tier alone. This is what a
 *     revoke that only cleared one side used to leave behind (DEF-001).
 *   entitlement_without_tier — still unlocked by the entitlement, but any code
 *     reading the tier directly (session hints, nav) shows them as free.
 */
export type EntitlementDrift = {
  userId: string;
  email: string | null;
  accessTier: string;
  kind: "tier_without_entitlement" | "entitlement_without_tier";
};

/** Every customer whose tier and entitlement disagree. Admin-triggered (PRD U5). */
export async function auditEntitlementConsistency(): Promise<EntitlementDrift[]> {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      email: true,
      accessTier: true,
      entitlements: {
        where: { product: ADVANCED_BUNDLE_PRODUCT },
        select: { revokedAt: true },
      },
    },
  });

  const drift: EntitlementDrift[] = [];
  for (const customer of customers) {
    const entitled = customer.entitlements.some((e) => e.revokedAt === null);
    const paidTier = customer.accessTier === "PAID";
    if (paidTier === entitled) continue;
    drift.push({
      userId: customer.id,
      email: customer.email,
      accessTier: customer.accessTier,
      kind: paidTier ? "tier_without_entitlement" : "entitlement_without_tier",
    });
  }
  return drift;
}
