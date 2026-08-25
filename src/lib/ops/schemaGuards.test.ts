import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { describeSchemaDrift, verifySchemaInvariants } from "./schemaGuards";
import { applyDbIndexes } from "../../../scripts/apply-db-indexes";

// These cases assert that the guard actually goes RED when the database is
// mis-provisioned. Without that, a guard that silently degrades into "always ok"
// would restore the very blind spot it was written to close — the same mutation
// discipline used on the exam settlement race.

async function reset() {
  await prisma.flightReviewCredit.deleteMany();
  await prisma.flightReviewBooking.deleteMany();
  await prisma.flightReviewSlot.deleteMany();
  await prisma.entitlement.deleteMany();
  await prisma.customer.deleteMany();
}

describe("deployment schema invariants", () => {
  // verifySchemaInvariants scans every customer, so leftovers from other files
  // would show up as pending migration work here.
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await applyDbIndexes(); // never leave the shared test database degraded
    await prisma.$disconnect();
  });

  it("passes on a correctly provisioned database", async () => {
    const report = await verifySchemaInvariants();

    expect(report).toEqual({ ok: true, missingIndexes: [], pendingCreditGrants: 0 });
    expect(describeSchemaDrift(report)).toBe("schema invariants satisfied");
  });

  it("catches a partial unique index that `db push` did not create", async () => {
    await prisma.$executeRawUnsafe('DROP INDEX "FlightReviewBooking_active_customer_key"');
    try {
      const report = await verifySchemaInvariants();

      expect(report.ok).toBe(false);
      expect(report.missingIndexes).toEqual(["FlightReviewBooking_active_customer_key"]);
      expect(describeSchemaDrift(report)).toContain("pnpm db:indexes");
    } finally {
      await applyDbIndexes();
    }

    expect((await verifySchemaInvariants()).ok).toBe(true);
  });

  it("catches both indexes missing, not just the first", async () => {
    await prisma.$executeRawUnsafe('DROP INDEX "FlightReviewBooking_active_customer_key"');
    await prisma.$executeRawUnsafe('DROP INDEX "FlightReviewBooking_active_slot_key"');
    try {
      const report = await verifySchemaInvariants();

      expect(report.missingIndexes.sort()).toEqual([
        "FlightReviewBooking_active_customer_key",
        "FlightReviewBooking_active_slot_key",
      ]);
    } finally {
      await applyDbIndexes();
    }
  });

  it("catches a credit migration that was never run", async () => {
    // A customer who paid before the consumable model existed: PAID, no credit.
    await prisma.customer.create({
      data: { id: "pre-migration", email: "pre@test.local", accessTier: "PAID" },
    });

    const report = await verifySchemaInvariants();

    expect(report.ok).toBe(false);
    expect(report.pendingCreditGrants).toBe(1);
    expect(describeSchemaDrift(report)).toContain("migrate-flight-review-credits");
  });

  it("stops reporting migration work once the customer holds their credit", async () => {
    await prisma.customer.create({
      data: { id: "migrated", email: "migrated@test.local", accessTier: "PAID" },
    });
    await prisma.flightReviewCredit.create({
      data: { customerId: "migrated", source: "course_bundle" },
    });

    const report = await verifySchemaInvariants();

    expect(report.pendingCreditGrants).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("stays satisfied for a customer who has already spent their credit", async () => {
    // The check must not confuse "credit used" with "credit never issued" —
    // otherwise it would cry wolf forever once customers start booking.
    await prisma.customer.create({
      data: { id: "spent", email: "spent@test.local", accessTier: "PAID" },
    });
    await prisma.flightReviewCredit.create({
      data: { customerId: "spent", source: "course_bundle", consumedAt: new Date() },
    });

    expect((await verifySchemaInvariants()).ok).toBe(true);
  });
});
