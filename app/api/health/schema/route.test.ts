import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { applyDbIndexes } from "../../../../scripts/apply-db-indexes";
import { GET } from "./route";

async function reset() {
  await prisma.flightReviewCredit.deleteMany();
  await prisma.flightReviewBooking.deleteMany();
  await prisma.flightReviewSlot.deleteMany();
  await prisma.entitlement.deleteMany();
  await prisma.customer.deleteMany();
}

describe("GET /api/health/schema", () => {
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await applyDbIndexes();
    await prisma.$disconnect();
  });

  it("200s on a correctly provisioned deploy", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, missingIndexes: [] });
  });

  it("503s — not 200 with a warning — when an index is missing", async () => {
    await prisma.$executeRawUnsafe('DROP INDEX "FlightReviewBooking_active_slot_key"');
    try {
      const res = await GET();

      // A smoke test only reads the status code, so a degraded deploy has to
      // fail the status code, not just say so in the body.
      expect(res.status).toBe(503);
      const body = (await res.json()) as { missingIndexes: string[] };
      expect(body.missingIndexes).toContain("FlightReviewBooking_active_slot_key");
    } finally {
      await applyDbIndexes();
    }
  });

  it("503s when the credit migration has not been run", async () => {
    await prisma.customer.create({
      data: { id: "health-pre", email: "health-pre@test.local", accessTier: "PAID" },
    });

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ ok: false, pendingCreditGrants: 1 });
  });
});
