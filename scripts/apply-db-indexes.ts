import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { splitSqlStatements } from "../src/lib/ops/sqlStatements";
import { assertWritableDbTarget, describeDbTarget, resolveDbUrl } from "../src/lib/ops/dbTarget";

/**
 * Applies every statement in prisma/sql/*.sql, in filename order.
 *
 * `prisma db push` — this project's schema workflow — can only create what the
 * Prisma schema can express. Two kinds of hardening fall outside that and must
 * be re-applied after every push, in test setup and in production:
 *
 *   001-rls.sql    Row Level Security: the event trigger and the backfill.
 *                  `db push --force-reset` cascades both away.
 *   002-...sql     Partial (WHERE-clause) unique indexes carrying the Flight
 *                  Review booking concurrency guarantees.
 *
 * Every statement must be idempotent (CREATE OR REPLACE / IF NOT EXISTS), since
 * this runs repeatedly. `pnpm db:verify` checks the result rather than trusting
 * that this ran.
 */
const SQL_DIR = join(process.cwd(), "prisma", "sql");

export async function applyDbIndexes(databaseUrl?: string): Promise<number> {
  // Resolved and checked before connecting: with no argument this falls back to
  // DATABASE_URL, which on a developer machine is the live database.
  const url = resolveDbUrl(databaseUrl);
  assertWritableDbTarget(url, process.env.ALLOW_REMOTE_DB_WRITE === "1");

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  let applied = 0;
  try {
    for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(SQL_DIR, file), "utf8");
      // Not split(";"): 001-rls.sql's PL/pgSQL bodies are full of semicolons.
      for (const statement of splitSqlStatements(sql)) {
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
  // Always say where, before doing anything. Silence about the target is what
  // let this script run against production unnoticed.
  try {
    console.log(`→ target: ${describeDbTarget(resolveDbUrl())}`);
  } catch {
    /* resolveDbUrl throws again below, with the same message */
  }
  applyDbIndexes()
    .then((n) => console.log(`✓ applied ${n} statement(s) from prisma/sql/`))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
