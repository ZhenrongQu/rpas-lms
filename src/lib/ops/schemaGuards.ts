import { prisma } from "../db";
import { migrateFlightReviewCredits } from "../flightReview/migrateCredits";

/**
 * Deployment invariants that `prisma db push` cannot establish on its own.
 *
 * This project syncs schema with `db push`, which only creates what the Prisma
 * schema can express. Three things fall outside that:
 *
 *   1. Partial (WHERE-clause) unique indexes — applied by `pnpm db:indexes`.
 *   2. Row Level Security — same script, prisma/sql/001-rls.sql.
 *   3. The one-time Flight Review credit migration — a data step, not a schema one.
 *
 * All three fail SILENTLY when skipped. A missing index downgrades "one booking
 * per customer / per slot" from a database guarantee to an application-level
 * check-then-write, visible only under concurrency. RLS off means Supabase's
 * anon / authenticated PostgREST roles are no longer denied by default — the app
 * itself keeps working, because Prisma connects as the table owner and bypasses
 * RLS either way. A skipped migration leaves every existing paying customer
 * unable to book the review they already bought.
 *
 * The test suite cannot catch any of them: `vitest.globalSetup` applies the SQL
 * itself, so CI is green whether or not production ever ran the step. That blind
 * spot is exactly what this module exists to close.
 */

/** Index names must match prisma/sql/002-flight-review-partial-indexes.sql. */
export const REQUIRED_PARTIAL_INDEXES = [
  "FlightReviewBooking_active_slot_key",
  "FlightReviewBooking_active_customer_key",
] as const;

export type SchemaInvariantReport = {
  ok: boolean;
  /** Partial unique indexes the database is missing. */
  missingIndexes: string[];
  /** Tables in the app schema that do not have Row Level Security enabled. */
  tablesWithoutRls: string[];
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
 * Asks the catalog which tables are unprotected, rather than asking whether the
 * `ensure_rls` event trigger exists. The trigger only fires on future CREATE
 * TABLEs, so its presence proves nothing about the tables already there — and
 * under `db push` every table is created before the trigger is.
 */
async function findTablesWithoutRls(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ relname: string }>>`
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
    ORDER BY c.relname
  `;
  return rows.map((r) => r.relname);
}

/**
 * Checks the deployed database against what the code assumes.
 *
 * The migration check is exact rather than heuristic: `migrateFlightReviewCredits`
 * is idempotent, so a dry run reporting `granted > 0` means there is genuinely
 * work left to do — not a guess about whether someone ran it.
 */
export async function verifySchemaInvariants(): Promise<SchemaInvariantReport> {
  const [missingIndexes, tablesWithoutRls, migration] = await Promise.all([
    findMissingIndexes(),
    findTablesWithoutRls(),
    migrateFlightReviewCredits({ dryRun: true }),
  ]);

  return {
    ok: missingIndexes.length === 0 && tablesWithoutRls.length === 0 && migration.granted === 0,
    missingIndexes,
    tablesWithoutRls,
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
  if (report.tablesWithoutRls.length > 0) {
    // Truncated: on a fresh database this is every table, and a 30-name list
    // buries the one instruction that matters.
    const shown = report.tablesWithoutRls.slice(0, 5).join(", ");
    const rest = report.tablesWithoutRls.length - 5;
    problems.push(
      `${report.tablesWithoutRls.length} table(s) without row level security: ${shown}${rest > 0 ? `, +${rest} more` : ""} — run \`pnpm db:indexes\``,
    );
  }
  if (report.pendingCreditGrants > 0) {
    problems.push(
      `${report.pendingCreditGrants} customer(s) awaiting the Flight Review credit migration — run \`tsx scripts/migrate-flight-review-credits.ts\``,
    );
  }
  return problems.join("; ");
}
