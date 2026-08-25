import { describeSchemaDrift, verifySchemaInvariants } from "../src/lib/ops/schemaGuards";
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
