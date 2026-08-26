import { spawnSync } from "node:child_process";
import {
  assertWritableDbTarget,
  describeDbTarget,
  loadEnvFile,
  resolveDbUrl,
} from "../src/lib/ops/dbTarget";

/**
 * `pnpm db:push` with a target check in front of it.
 *
 * `prisma db push` is the most destructive command in this repo — it applies
 * DDL, and with --accept-data-loss it drops tables — and on its own it says
 * nothing about which database it is about to reshape. It reads DATABASE_URL
 * from .env, and on 2026-08-26 .env held the production project while being
 * named and treated as dev. A full release rehearsal, including three dropped
 * tables, ran against production before anyone noticed.
 *
 * db:indexes, db:verify and the credit migration already announce their target
 * and refuse a remote one without an explicit opt-in. This closes the hole that
 * mattered most, since a mistaken push is the one that cannot be undone.
 *
 * Escape hatch, for a real deploy:
 *   ALLOW_REMOTE_DB_WRITE=1 pnpm db:push
 */
// tsx does not load .env; the Prisma CLI this wraps does. Resolve what it will.
loadEnvFile();

const url = resolveDbUrlOrExit();
console.log(`→ target: ${describeDbTarget(url)}`);

try {
  assertWritableDbTarget(url, process.env.ALLOW_REMOTE_DB_WRITE === "1");
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const result = spawnSync("pnpm", ["exec", "prisma", "db", "push", ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);

function resolveDbUrlOrExit(): string {
  try {
    return resolveDbUrl();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
