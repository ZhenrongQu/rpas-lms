import { readFileSync } from "node:fs";

/**
 * Which database an ops script is about to touch, and whether it may write there.
 *
 * `new PrismaClient()` with no explicit datasource resolves DATABASE_URL, and on
 * a developer machine `.env` holds the LIVE database — so `pnpm db:indexes`,
 * which reads as a local command, silently applies DDL to production. That is
 * not hypothetical: it happened while building this guard, and the only reason
 * it was harmless is that the statements were idempotent and one of them failed.
 *
 * So: every ops entry point prints its target, and the mutating one refuses a
 * non-local target unless the operator says so explicitly. Deploying still works
 * — it just has to be deliberate:
 *
 *     ALLOW_REMOTE_DB_WRITE=1 pnpm db:indexes
 */

/** "host:port/database", safe to log — never includes credentials. */
export function describeDbTarget(url: string): string {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, "") || "(default)";
  return `${parsed.hostname}:${parsed.port || "5432"}/${database}`;
}

export function isLocalDbTarget(url: string): boolean {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/** Throws unless the target is local or the operator opted in explicitly. */
export function assertWritableDbTarget(url: string, allowRemote: boolean): void {
  if (isLocalDbTarget(url) || allowRemote) return;
  throw new Error(
    `Refusing to write to a non-local database: ${describeDbTarget(url)}\n` +
      "This is where DATABASE_URL points — on a dev machine that is usually production.\n" +
      "If that is genuinely the intent, re-run with ALLOW_REMOTE_DB_WRITE=1.",
  );
}

/** The URL an ops script will use, with a clear error instead of a Prisma one. */
export function resolveDbUrl(explicit?: string): string {
  const url = explicit ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL: pass one explicitly or set DATABASE_URL.");
  return url;
}

/**
 * Loads `.env` into process.env, without overriding what is already set.
 *
 * The Prisma CLI and Next both do this on their own; a plain `tsx script.ts`
 * does not. An ops script that wraps the Prisma CLI therefore has to resolve
 * the same DATABASE_URL the CLI would, or its target check inspects one
 * database while the command reshapes another — which is worse than no check.
 *
 * Deliberately does not read `.env.production`: only Next loads that, and only
 * under NODE_ENV=production. An ops script picking it up would reintroduce the
 * ambiguity this module exists to remove.
 */
export function loadEnvFile(path = ".env"): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return; // no .env is normal in CI
  }
  for (const line of text.split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.trim().replace(/^(['"])(.*)\1$/s, "$2");
  }
}

/**
 * What a mutating ops script runs before its first query: resolve the URL it is
 * about to use, print it, and refuse a non-local target without an explicit
 * opt-in. Returns the target for a caller that builds its own client.
 *
 * `@prisma/client` loads `.env` itself the moment it is imported — even under
 * `tsx`, which does not — so a plain `tsx scripts/whatever.ts` connects to
 * whatever that file names with nothing on screen to say which database that
 * is. The four deploy-path commands got this guard on 2026-08-26; every other
 * script that writes was still resolving the same ambient URL in silence.
 *
 * Throws rather than exiting: each script's entry point already catches, prints
 * and sets a non-zero status, and a function that exits cannot be tested.
 */
export function guardDbWrite(options: { dryRun?: boolean } = {}): string {
  // Only matters when the guard runs before @prisma/client is imported; it does
  // not override what is already set, so an inline DATABASE_URL still wins.
  loadEnvFile();
  const url = resolveDbUrl();
  const dryRun = options.dryRun ?? false;
  console.log(`→ target: ${describeDbTarget(url)}${dryRun ? " (dry run, read-only)" : ""}`);
  // A dry run needs no opt-in: it reads, and "look before you write" should cost
  // nothing. Matches the credit migration's CLI.
  if (!dryRun) assertWritableDbTarget(url, process.env.ALLOW_REMOTE_DB_WRITE === "1");
  return url;
}
