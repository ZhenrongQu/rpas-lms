import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../../src/lib/db";
import { GET as check } from "./route";

// P3: the availability endpoint is public, so its per-IP cap is the only thing
// stopping username enumeration / DB hammering. Pin "locked -> 429" so a future
// refactor can't quietly drop the guard.
const IP = "198.51.100.71";

function get(username: string, ip?: string) {
  const headers: Record<string, string> = {};
  if (ip) headers["x-forwarded-for"] = ip;
  return new Request(`http://test/api/auth/username/check?username=${encodeURIComponent(username)}`, { headers });
}

async function clearRl() {
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "username-check:" } } });
}

describe("GET /api/auth/username/check", () => {
  beforeEach(clearRl);
  afterAll(async () => {
    await clearRl();
    await prisma.$disconnect();
  });

  it("answers a normal availability request (not rate-limited)", async () => {
    const res = await check(get("freshname12345"));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("available");
  });

  it("returns 429 when the per-IP limit is locked", async () => {
    await prisma.rateLimit.create({
      data: { key: `username-check:ip:${IP}`, lockedUntil: new Date(Date.now() + 5 * 60_000) },
    });
    const res = await check(get("anyname12345", IP));
    expect(res.status).toBe(429);
  });
});
