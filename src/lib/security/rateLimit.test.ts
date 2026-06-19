import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { clearRateLimit, enforceRateLimit, hitRateLimit, isLocked } from "./rateLimit";

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
