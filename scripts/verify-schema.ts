import { describeSchemaDrift, verifySchemaInvariants } from "../src/lib/ops/schemaGuards";
import { describeDbTarget, resolveDbUrl } from "../src/lib/ops/dbTarget";
import { prisma } from "../src/lib/db";

/**
 * Deployment gate: fails loudly when the database is missing something
 * `prisma db push` cannot create on its own.
 *
 *   pnpm db:verify
 *
 * Run it BEFORE routing traffic at a new deploy — after `db:indexes` and after
 * the Flight Review credit migration. Both of those steps fail silently when
 * skipped, and a non-zero exit here is the only thing that turns that silence
 * into a stopped deploy.
 */
// Read-only, so no write gate — but still say which database was inspected, or a
// green result says nothing about the one being deployed.
try {
  console.log(`→ target: ${describeDbTarget(resolveDbUrl())}`);
} catch {
  /* fall through: the query below fails with its own message */
}

verifySchemaInvariants()
  .then((report) => {
    if (report.ok) {
      console.log("✓ schema invariants satisfied");
      return;
    }
    console.error(`✗ ${describeSchemaDrift(report)}`);
    process.exitCode = 1;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
