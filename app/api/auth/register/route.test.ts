import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { POST as register } from "./route";

function req(body: unknown) {
  return new Request("http://test/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.rateLimit.deleteMany(); // SEC-11: reset register IP/email caps between cases
  });

  afterAll(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.rateLimit.deleteMany();
    await prisma.$disconnect();
  });

  it("creates a pending password account and sends an email verification code", async () => {
    const res = await register(req({
      email: "Pilot@Example.COM",
      password: "correct-password",
      username: "PilotOne",
      phone: "(604) 555-1234",
    }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, emailVerificationRequired: true });

    const user = await prisma.customer.findUniqueOrThrow({ where: { email: "pilot@example.com" } });
    expect(user.username).toBe("pilotone");
    expect(user.phone).toBe("+16045551234");
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.hashedPassword).toBeTruthy();

    const code = await prisma.verificationCode.findFirstOrThrow({
      where: { channel: "email", target: "pilot@example.com" },
    });
    expect(code.codeHash).toBeTruthy();
  });

  it("rejects invalid bodies with per-field error codes", async () => {
    const res = await register(req({ email: "bad", password: "short", username: "ab" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid body",
      fields: {
        email: "email_invalid",
        password: "password_length",
        username: "username_length",
      },
    });
  });

  it("rejects a common password with a weak-password field hint (SEC-13)", async () => {
    const res = await register(req({ email: "newpilot@example.com", password: "password123" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "weak_password", fields: { password: "password_weak" } });
  });

  it("rate-limits registrations per IP (SEC-11)", async () => {
    // The IP cap (12/hour) runs before body parsing, so even invalid bodies count.
    for (let i = 0; i < 12; i++) {
      expect((await register(req({ email: "bad" }))).status).toBe(400);
    }
    expect((await register(req({ email: "bad" }))).status).toBe(429);
  });

  it("rejects a verified duplicate email", async () => {
    await prisma.customer.create({
      data: {
        email: "dup@example.com",
        hashedPassword: "hash",
        emailVerifiedAt: new Date("2026-06-08T00:00:00.000Z"),
        accessTier: "FREE",
      },
    });

    const res = await register(req({ email: "dup@example.com", password: "correct-password" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "email_already_registered" });
  });
});
