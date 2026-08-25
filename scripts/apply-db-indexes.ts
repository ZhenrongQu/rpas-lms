import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Applies every statement in prisma/sql/*.sql.
 *
 * `prisma db push` — this project's schema workflow — can only create what the
 * Prisma schema can express, and partial (WHERE-clause) unique indexes are not
 * expressible. Those indexes carry real concurrency guarantees, so they must be
 * re-applied after every push: in test setup, and in production.
 *
 * Every statement must be idempotent (IF NOT EXISTS), since this runs repeatedly.
 */
const SQL_DIR = join(process.cwd(), "prisma", "sql");

export async function applyDbIndexes(databaseUrl?: string): Promise<number> {
  const prisma = databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();
  let applied = 0;
  try {
    for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(SQL_DIR, file), "utf8");
      for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
        await prisma.$executeRawUnsafe(statement);
        applied++;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  return applied;
}

if (process.argv[1]?.endsWith("apply-db-indexes.ts")) {
  applyDbIndexes()
    .then((n) => console.log(`✓ applied ${n} index statement(s) from prisma/sql/`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
