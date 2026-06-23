import { prisma } from "../db";

// SEC-10/11: DB-backed fixed-window rate limiter. In-memory counters are
// unreliable on Vercel (each request may hit a different stateless instance),
// so the count lives in the `RateLimit` table keyed by scope.

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

type HitArgs = {
  key: string;
  limit: number; // attempts allowed within the window
  windowSec: number; // length of the counting window
  blockSec: number; // how long to lock the key once the limit is exceeded
  now?: () => Date;
};

// Opportunistic-cleanup tuning: a row untouched for this long with no live lock
// is fair game for GC; SWEEP_PROBABILITY is the per-call chance we run a sweep.
const RATE_LIMIT_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_PROBABILITY = 0.01;

/**
 * Record one attempt against `key` and report whether it is allowed.
 *
 * - Fewer than `limit` attempts in the current `windowSec` window → allowed.
 * - The attempt that exceeds `limit` → denied, and the key is locked for
 *   `blockSec`; every attempt during the lock stays denied.
 * - After the window (or lock) elapses the counter resets on the next call.
 *
 * P1-2: the count/lock transition is a SINGLE atomic `INSERT … ON CONFLICT DO
 * UPDATE`. Postgres serializes conflicting upserts on the same key, so every
 * attempt is counted exactly once even under heavy concurrency — a read-modify-
 * write would let parallel requests read the same count and undercount, which on
 * the login/admin boundary would weaken brute-force protection. All time math is
 * done in JS (no SQL interval arithmetic) so an injected `now` still threads
 * through for tests. `windowFloor` = the cutoff before which the window has
 * elapsed; `lockUntil` = when a freshly-tripped lock should expire.
 */
export async function hitRateLimit({
  key,
  limit,
  windowSec,
  blockSec,
  now = () => new Date(),
}: HitArgs): Promise<RateLimitResult> {
  const current = now();
  const windowFloor = new Date(current.getTime() - windowSec * 1000);
  const lockUntil = new Date(current.getTime() + blockSec * 1000);

  const rows = await prisma.$queryRaw<Array<{ lockedUntil: Date | null }>>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart", "lockedUntil", "updatedAt")
    VALUES (${key}, 1, ${current}, NULL, ${current})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."lockedUntil" IS NOT NULL AND "RateLimit"."lockedUntil" > ${current} THEN "RateLimit"."count"
        WHEN "RateLimit"."windowStart" <= ${windowFloor} THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimit"."lockedUntil" IS NOT NULL AND "RateLimit"."lockedUntil" > ${current} THEN "RateLimit"."windowStart"
        WHEN "RateLimit"."windowStart" <= ${windowFloor} THEN ${current}
        ELSE "RateLimit"."windowStart"
      END,
      "lockedUntil" = CASE
        WHEN "RateLimit"."lockedUntil" IS NOT NULL AND "RateLimit"."lockedUntil" > ${current} THEN "RateLimit"."lockedUntil"
        WHEN "RateLimit"."windowStart" <= ${windowFloor} THEN NULL
        WHEN "RateLimit"."count" + 1 > ${limit} THEN ${lockUntil}
        ELSE "RateLimit"."lockedUntil"
      END,
      "updatedAt" = ${current}
    RETURNING "lockedUntil"
  `;

  const lockedUntil = rows[0]?.lockedUntil ?? null;

  // Opportunistic GC (no cron required): on a small fraction of calls, prune
  // rows idle well past their window/lock so the table can't grow unbounded on
  // a stateless deploy. Awaited so it runs to completion before a serverless
  // function can suspend; cheap once the table is kept small by these sweeps.
  if (Math.random() < SWEEP_PROBABILITY) {
    await sweepExpiredRateLimits(now).catch(() => {});
  }

  if (lockedUntil && lockedUntil > current) {
    return { allowed: false, retryAfterSec: secsUntil(lockedUntil, current) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** Forget a key entirely (e.g. clear login failures after a successful login). */
export async function clearRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

/**
 * Best-effort GC of rows idle well past their window and lock. Safe to run from
 * a cron OR opportunistically — it only deletes rows untouched for
 * RATE_LIMIT_TTL_MS whose lock has elapsed (or is null), so it never drops a
 * live counter or an active lockout. Returns the number of rows removed.
 */
export async function sweepExpiredRateLimits(now: () => Date = () => new Date()): Promise<number> {
  const current = now();
  const cutoff = new Date(current.getTime() - RATE_LIMIT_TTL_MS);
  const { count } = await prisma.rateLimit.deleteMany({
    where: {
      updatedAt: { lt: cutoff },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: current } }],
    },
  });
  return count;
}

/**
 * Count one attempt and, if over the limit, return a ready-to-send 429 — else
 * null. Convenience wrapper for route handlers (SEC-11).
 */
export async function enforceRateLimit(
  key: string,
  opts: { limit: number; windowSec: number; blockSec: number },
): Promise<Response | null> {
  const res = await hitRateLimit({ key, ...opts });
  return res.allowed ? null : tooManyRequests(res.retryAfterSec);
}

/** Read-only lock check that does NOT count an attempt. */
export async function isLocked(key: string, now: () => Date = () => new Date()): Promise<RateLimitResult> {
  const current = now();
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  if (row?.lockedUntil && row.lockedUntil > current) {
    return { allowed: false, retryAfterSec: secsUntil(row.lockedUntil, current) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * Best-effort client IP for rate-limit keys. On Vercel (and most managed
 * platforms) the edge OVERWRITES `x-real-ip` / `x-forwarded-for` with the real
 * client IP before the function runs, so a client-supplied value never reaches
 * us. We read `x-real-ip` first — a single, platform-set value — and only fall
 * back to the left-most `x-forwarded-for` entry. NOTE: this trust model assumes
 * an edge that sets these headers; if ever deployed behind a proxy that passes
 * client-supplied forwarding headers through, the source must be revisited
 * (taking the left-most XFF entry would then be spoofable).
 */
export function clientIp(req: Request | undefined): string {
  if (!req?.headers) return "unknown";
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}

/** Standard 429 with a Retry-After header. */
export function tooManyRequests(retryAfterSec: number): Response {
  return Response.json(
    { error: "too_many_requests", retryAfterSec },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSec)) } },
  );
}

function secsUntil(future: Date, from: Date): number {
  return Math.max(1, Math.ceil((future.getTime() - from.getTime()) / 1000));
}
