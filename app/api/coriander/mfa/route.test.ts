import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../../../../src/lib/db";
import { generateTotpSecret } from "../../../../src/lib/auth/totp";

// P2: the MFA step-up (confirm/disable) verifies a password + TOTP, so it must be
// throttled — a stolen admin session must not be able to brute-force it here.

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("../../../../auth", () => ({ auth: authMock }));

import { POST as mfaPOST } from "./route";

const ADMIN = "mfa-rl-admin";
const IP = "203.0.113.9";

const disableBody = (password: string) =>
  new Request("http://test/api/coriander/mfa", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": IP },
    body: JSON.stringify({ action: "disable", password, token: "000000" }),
  });

async function cleanup() {
  await prisma.admin.deleteMany({ where: { id: ADMIN } });
  await prisma.rateLimit.deleteMany({ where: { key: { contains: ADMIN } } });
  await prisma.rateLimit.deleteMany({ where: { key: `mfa:ip:${IP}` } });
}

describe("/api/coriander/mfa step-up rate limit (P2)", () => {
  beforeEach(async () => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: ADMIN, isAdmin: true } });
    await cleanup();
    await prisma.admin.create({
      data: {
        id: ADMIN,
        username: "mfa-rl-admin",
        hashedPassword: await bcrypt.hash("correct-horse", 10),
        totpSecret: generateTotpSecret(),
        totpEnabledAt: new Date(),
      },
    });
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("locks the step-up endpoint after repeated bad attempts", async () => {
    // First 5 failures count up; the 6th trips the lock (count > limit of 5).
    for (let i = 0; i < 6; i++) {
      expect((await mfaPOST(disableBody("wrong-pass"))).status).toBe(422);
    }
    // Now locked — even further attempts short-circuit to 429 before any check.
    expect((await mfaPOST(disableBody("wrong-pass"))).status).toBe(429);
  });
});
