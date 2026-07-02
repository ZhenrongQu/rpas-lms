import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// Build (or reset) the Postgres schema in the test database once, before the suite,
// then seed the real question bank + lessons so DB-backed exam/checkpoint/lesson
// tests run against actual content. DATABASE_URL/DIRECT_URL are passed explicitly
// so the Prisma CLI's dotenv (which holds the live Supabase URL) does not override
// them. Must match the TEST_DATABASE_URL default in vitest.config.ts.
export default async function setup(): Promise<void> {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/postgres";
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync("pnpm exec prisma db push --force-reset --skip-generate", { stdio: "inherit", env });
  execSync("pnpm exec tsx scripts/seed-test-fixtures.ts", { stdio: "inherit", env });
  await ensureRemediationDatabase(url);
}

// The remediation advisory-lock test needs a dedicated database (no schema) to
// exist. Create it once here so a clean `pnpm test` is self-contained. Idempotent:
// a duplicate-database error (42P04) means it already exists.
async function ensureRemediationDatabase(baseUrl: string): Promise<void> {
  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    await admin.$executeRawUnsafe('CREATE DATABASE "rpas_remediation_test"');
  } catch (e) {
    const msg = String(e);
    if (!msg.includes("already exists") && !msg.includes("42P04")) throw e;
  } finally {
    await admin.$disconnect();
  }
}
