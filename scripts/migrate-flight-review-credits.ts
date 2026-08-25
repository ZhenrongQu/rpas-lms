import { migrateFlightReviewCredits } from "../src/lib/flightReview/migrateCredits";
import { prisma } from "../src/lib/db";

/**
 * CLI for the one-time Flight Review credit migration (PRD U13 §13.6). Run once,
 * right after deploying the credit schema:
 *
 *   pnpm exec tsx scripts/migrate-flight-review-credits.ts --dry-run
 *   pnpm exec tsx scripts/migrate-flight-review-credits.ts
 */
const dryRun = process.argv.includes("--dry-run");

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
