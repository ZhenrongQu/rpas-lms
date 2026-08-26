import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { applyDbIndexes } from "../scripts/apply-db-indexes";
import { e2eDatabaseUrl } from "./env";
import { seedFlightReviewJourney } from "./seed";

/**
 * Builds the E2E database from scratch before the browser starts.
 *
 * Same shape as vitest.globalSetup, and the same reason for `db:indexes`: the
 * booking uniqueness guarantees and RLS are not in the Prisma schema, so a
 * database built by `db push` alone is not the database this app deploys onto.
 */
export default async function globalSetup(): Promise<void> {
  const url = e2eDatabaseUrl();
  await ensureDatabaseExists(url);

  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync("pnpm exec prisma db push --force-reset --skip-generate", { stdio: "inherit", env });
  await applyDbIndexes(url);

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await seedFlightReviewJourney(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function ensureDatabaseExists(url: string): Promise<void> {
  const admin = new URL(url);
  const target = admin.pathname.replace(/^\//, "");
  admin.pathname = "/postgres";

  const prisma = new PrismaClient({ datasources: { db: { url: admin.toString() } } });
  try {
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${target}"`);
  } catch (e) {
    // 42P04 = already exists, which is the normal case on a re-run.
    if (!String(e).includes("already exists") && !String(e).includes("42P04")) throw e;
  } finally {
    await prisma.$disconnect();
  }
}
