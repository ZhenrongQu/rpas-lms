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
