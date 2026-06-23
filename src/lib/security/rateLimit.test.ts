import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { clearRateLimit, clientIp, enforceRateLimit, hitRateLimit, isLocked, sweepExpiredRateLimits } from "./rateLimit";

const KEY = "test:ratelimit:unit";
const at = (ms: number) => () => new Date(ms);

async function reset() {
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "test:ratelimit:" } } });
}

describe("hitRateLimit (SEC-10/11 primitive)", () => {
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("allows up to `limit`, denies the next, and locks", async () => {
    const opts = { key: KEY, limit: 3, windowSec: 60, blockSec: 120, now: at(1_000) };
    expect((await hitRateLimit(opts)).allowed).toBe(true); // 1
    expect((await hitRateLimit(opts)).allowed).toBe(true); // 2
    expect((await hitRateLimit(opts)).allowed).toBe(true); // 3
    const denied = await hitRateLimit(opts); // 4 → over limit
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBe(120);
  });

  it("stays locked for the whole block window, then resets", async () => {
    const base = { key: KEY, limit: 1, windowSec: 60, blockSec: 100 };
    expect((await hitRateLimit({ ...base, now: at(0) })).allowed).toBe(true);
    expect((await hitRateLimit({ ...base, now: at(1_000) })).allowed).toBe(false); // locks until 1000+100s
    // Still inside the lock.
    expect((await isLocked(KEY, at(50_000))).allowed).toBe(false);
    // After the lock elapses a fresh window starts.
    expect((await hitRateLimit({ ...base, now: at(200_000) })).allowed).toBe(true);
  });

  it("resets the counter once the window expires (no lock)", async () => {
    const base = { key: KEY, limit: 2, windowSec: 60, blockSec: 60 };
    await hitRateLimit({ ...base, now: at(0) });
    await hitRateLimit({ ...base, now: at(10_000) });
    // 61s later → new window, allowed again.
    expect((await hitRateLimit({ ...base, now: at(61_000) })).allowed).toBe(true);
  });

  it("clearRateLimit forgets the key", async () => {
    const opts = { key: KEY, limit: 1, windowSec: 60, blockSec: 60, now: at(0) };
    await hitRateLimit(opts);
    await hitRateLimit(opts); // locked
    await clearRateLimit(KEY);
    expect((await isLocked(KEY, at(0))).allowed).toBe(true);
  });

  it("enforceRateLimit returns a 429 only once over the limit", async () => {
    const opts = { limit: 1, windowSec: 60, blockSec: 60 };
    expect(await enforceRateLimit("test:ratelimit:http", opts)).toBeNull();
    const res = await enforceRateLimit("test:ratelimit:http", opts);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBeTruthy();
  });

  // P1-2: under concurrency the atomic upsert must count every hit exactly once,
  // so exactly `limit` of N parallel attempts are allowed and the rest denied.
  it("counts concurrent hits atomically (no undercount)", async () => {
    const key = "test:ratelimit:concurrent";
    const opts = { key, limit: 5, windowSec: 60, blockSec: 60 };
    const results = await Promise.all(Array.from({ length: 20 }, () => hitRateLimit(opts)));
    expect(results.filter((r) => r.allowed).length).toBe(5);
    expect(results.filter((r) => !r.allowed).length).toBe(15);
  });
});

// P3: clientIp underpins every per-IP key, so its header precedence and
// fallback are security-relevant — pin them so a refactor can't silently
// start trusting the spoofable left-most XFF entry over the platform header.
describe("clientIp (per-IP key derivation)", () => {
  const ipReq = (headers: Record<string, string>) => new Request("http://test", { headers });

  it("prefers x-real-ip over x-forwarded-for", () => {
    expect(clientIp(ipReq({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("9.9.9.9");
  });

  it("falls back to the left-most x-forwarded-for entry when x-real-ip is absent", () => {
    expect(clientIp(ipReq({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" }))).toBe("1.1.1.1");
  });

  it("trims surrounding whitespace", () => {
    expect(clientIp(ipReq({ "x-real-ip": "  4.4.4.4  " }))).toBe("4.4.4.4");
    expect(clientIp(ipReq({ "x-forwarded-for": "  5.5.5.5 , 6.6.6.6" }))).toBe("5.5.5.5");
  });

  it("returns 'unknown' when no forwarding headers are present", () => {
    expect(clientIp(ipReq({}))).toBe("unknown");
    expect(clientIp(undefined)).toBe("unknown");
  });
});

describe("sweepExpiredRateLimits (P3 cleanup)", () => {
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("deletes long-idle rows but keeps fresh and still-locked ones", async () => {
    const realNow = Date.now();
    const twoDaysAgo = new Date(realNow - 2 * 24 * 60 * 60 * 1000);

    await prisma.rateLimit.create({ data: { key: "test:ratelimit:stale" } });
    await prisma.rateLimit.create({ data: { key: "test:ratelimit:fresh" } });
    await prisma.rateLimit.create({
      data: { key: "test:ratelimit:locked", lockedUntil: new Date(realNow + 24 * 60 * 60 * 1000) },
    });
    // `updatedAt` is @updatedAt-managed, so back-date it with raw SQL to simulate idleness.
    await prisma.$executeRaw`UPDATE "RateLimit" SET "updatedAt" = ${twoDaysAgo} WHERE "key" IN ('test:ratelimit:stale', 'test:ratelimit:locked')`;

    const removed = await sweepExpiredRateLimits();
    expect(removed).toBe(1); // only :stale — idle AND no live lock

    const keys = (
      await prisma.rateLimit.findMany({ where: { key: { startsWith: "test:ratelimit:" } }, select: { key: true } })
    )
      .map((r) => r.key)
      .sort();
    expect(keys).toEqual(["test:ratelimit:fresh", "test:ratelimit:locked"]);
  });
});
