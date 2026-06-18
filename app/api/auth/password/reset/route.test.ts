import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../../src/lib/db";
import { verifyPassword } from "../../../../../src/lib/auth/password";
import { createPasswordResetToken } from "../../../../../src/lib/auth/localAccount";
import { POST as reset } from "./route";

const EMAIL = "reset-user@example.com";
const NEW_PW = "Brand-New-Pw1";

function req(body: unknown) {
  return new Request("http://test/api/auth/password/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function cleanup() {
  await prisma.verificationCode.deleteMany({ where: { target: EMAIL } });
  await prisma.customer.deleteMany({ where: { email: EMAIL } });
}

async function seedUserAndToken(): Promise<string> {
  // Seed an unverified account so we can also assert the reset marks it verified.
  await prisma.customer.create({
    data: { email: EMAIL, hashedPassword: "old-hash", emailVerifiedAt: null, accessTier: "FREE" },
  });
  const result = await createPasswordResetToken({ email: EMAIL });
  if (!result.ok) throw new Error("expected a reset token");
  return result.token;
}

describe("POST /api/auth/password/reset", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("sets the new password with a valid token and marks the email verified", async () => {
    const token = await seedUserAndToken();

    const res = await reset(req({ email: EMAIL, token, newPassword: NEW_PW }));
    expect(res.status).toBe(200);

    const user = await prisma.customer.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(await verifyPassword(NEW_PW, user.hashedPassword!)).toBe(true);
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("rejects an invalid token", async () => {
    await seedUserAndToken();
    const res = await reset(req({ email: EMAIL, token: "wrong-token", newPassword: NEW_PW }));
    expect(res.status).toBe(400);
  });

  it("rejects a reused token", async () => {
    const token = await seedUserAndToken();
    expect((await reset(req({ email: EMAIL, token, newPassword: NEW_PW }))).status).toBe(200);
    const again = await reset(req({ email: EMAIL, token, newPassword: "Another-Pw2x" }));
    expect(again.status).toBe(400);
  });
});
