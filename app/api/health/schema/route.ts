import {
  describeSchemaDrift,
  verifySchemaInvariants,
} from "../../../../src/lib/ops/schemaGuards";

// Reads live database state; a cached answer from a healthy moment would be
// worse than no check at all.
export const dynamic = "force-dynamic";

/**
 * GET /api/health/schema — deploy smoke probe (PRD U13 rollout).
 *
 * 200 when the database has everything `prisma db push` cannot create: the
 * partial unique indexes, and the completed Flight Review credit migration.
 * 503 with the specific problem otherwise.
 *
 * Unauthenticated on purpose — a probe that needs a session is useless to a
 * health check, and it reveals nothing beyond "this deploy is provisioned",
 * with no customer data in the response.
 */
export async function GET(): Promise<Response> {
  try {
    const report = await verifySchemaInvariants();
    return Response.json(
      {
        ok: report.ok,
        detail: describeSchemaDrift(report),
        missingIndexes: report.missingIndexes,
        pendingCreditGrants: report.pendingCreditGrants,
      },
      { status: report.ok ? 200 : 503 },
    );
  } catch {
    // Unreachable database is itself an unhealthy deploy.
    return Response.json({ ok: false, detail: "schema check failed" }, { status: 503 });
  }
}
