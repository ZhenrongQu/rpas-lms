import { migrateFlightReviewCredits } from "../src/lib/flightReview/migrateCredits";
import { assertWritableDbTarget, describeDbTarget, resolveDbUrl } from "../src/lib/ops/dbTarget";
import { prisma } from "../src/lib/db";

/**
 * CLI for the one-time Flight Review credit migration (PRD U13 §13.6). Run once,
 * right after deploying the credit schema:
 *
 *   pnpm exec tsx scripts/migrate-flight-review-credits.ts --dry-run
 *   ALLOW_REMOTE_DB_WRITE=1 pnpm exec tsx scripts/migrate-flight-review-credits.ts
 *
 * Same target guard as `db:indexes`, for the same reason: this resolves
 * DATABASE_URL from .env, and it grants entitlements to every paying customer
 * in whatever database that turns out to be. The dry run is read-only and needs
 * no opt-in, so "look before you write" costs nothing.
 */
const dryRun = process.argv.includes("--dry-run");

try {
  const url = resolveDbUrl();
  console.log(`→ target: ${describeDbTarget(url)}${dryRun ? " (dry run, read-only)" : ""}`);
  if (!dryRun) assertWritableDbTarget(url, process.env.ALLOW_REMOTE_DB_WRITE === "1");
} catch (e) {
  // The refusal is the message; a stack trace here buries it.
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

migrateFlightReviewCredits({ dryRun })
  .then((s) => {
    console.log(
      `${dryRun ? "[dry run] " : ""}credits granted: ${s.granted}, already present: ${s.skipped}, bookings bound: ${s.bookingsBound}`,
    );
    for (const id of s.orphanedBookings) {
      console.warn(`  ! booking ${id} had no credit to bind — grant one manually`);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
