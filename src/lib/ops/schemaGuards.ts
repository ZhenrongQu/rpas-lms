import { prisma } from "../db";
import { migrateFlightReviewCredits } from "../flightReview/migrateCredits";

/**
 * Deployment invariants that `prisma db push` cannot establish on its own.
 *
 * This project syncs schema with `db push`, which only creates what the Prisma
 * schema can express. Two things fall outside that:
 *
 *   1. Partial (WHERE-clause) unique indexes — created by `pnpm db:indexes`.
 *   2. The one-time Flight Review credit migration — a data step, not a schema one.
 *
 * Both fail SILENTLY when skipped. A missing index downgrades "one booking per
 * customer / per slot" from a database guarantee to an application-level
 * check-then-write, visible only under concurrency. A skipped migration leaves
 * every existing paying customer unable to book the review they already bought.
 *
 * The test suite cannot catch either: `vitest.globalSetup` applies the indexes
 * itself, so CI is green whether or not production ever ran the step. That blind
 * spot is exactly what this module exists to close.
 */

/** Index names must match prisma/sql/flight-review-partial-indexes.sql. */
export const REQUIRED_PARTIAL_INDEXES = [
  "FlightReviewBooking_active_slot_key",
  "FlightReviewBooking_active_customer_key",
] as const;

export type SchemaInvariantReport = {
  ok: boolean;
  /** Partial unique indexes the database is missing. */
  missingIndexes: string[];
  /** Customers the credit migration would still issue a credit to. */
  pendingCreditGrants: number;
};

async function findMissingIndexes(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = current_schema() AND tablename = 'FlightReviewBooking'
  `;
  const present = new Set(rows.map((r) => r.indexname));
  return REQUIRED_PARTIAL_INDEXES.filter((name) => !present.has(name));
}

/**
 * Checks the deployed database against what the code assumes.
 *
 * The migration check is exact rather than heuristic: `migrateFlightReviewCredits`
 * is idempotent, so a dry run reporting `granted > 0` means there is genuinely
 * work left to do — not a guess about whether someone ran it.
 */
export async function verifySchemaInvariants(): Promise<SchemaInvariantReport> {
  const [missingIndexes, migration] = await Promise.all([
    findMissingIndexes(),
    migrateFlightReviewCredits({ dryRun: true }),
  ]);

  return {
    ok: missingIndexes.length === 0 && migration.granted === 0,
    missingIndexes,
    pendingCreditGrants: migration.granted,
  };
}

/** One-line human summary for logs, Sentry, and the health endpoint. */
export function describeSchemaDrift(report: SchemaInvariantReport): string {
  if (report.ok) return "schema invariants satisfied";
  const problems: string[] = [];
  if (report.missingIndexes.length > 0) {
    problems.push(`missing partial unique index(es): ${report.missingIndexes.join(", ")} — run \`pnpm db:indexes\``);
  }
  if (report.pendingCreditGrants > 0) {
    problems.push(
      `${report.pendingCreditGrants} customer(s) awaiting the Flight Review credit migration — run \`tsx scripts/migrate-flight-review-credits.ts\``,
    );
  }
  return problems.join("; ");
}
