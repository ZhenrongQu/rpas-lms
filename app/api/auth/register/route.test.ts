import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../../../../src/lib/db";

// The delivery layer is mocked so a provider rejection can be exercised: in test
// NODE_ENV the real sender short-circuits to a console line and never throws.
const { sendCodeMock } = vi.hoisted(() => ({ sendCodeMock: vi.fn() }));
vi.mock("../../../../src/lib/auth/delivery", () => ({ sendVerificationCode: sendCodeMock }));

import { POST as register } from "./route";

function req(body: unknown) {
  return new Request("http://test/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    sendCodeMock.mockReset();
    await prisma.notificationLog.deleteMany();
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.rateLimit.deleteMany(); // SEC-11: reset register IP/email caps between cases
  });

  afterAll(async () => {
    await prisma.notificationLog.deleteMany();
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

  // DEF-004, second half. The sender now throws on a rejected send — and this
  // route used to let that land in the catch and answer "registration failed",
  // for an account it had already committed.
  it("still reports the account as created when the provider rejects the code email", async () => {
    sendCodeMock.mockRejectedValue(
      new Error("Resend rejected the message (validation_error): API key is invalid"),
    );

    const res = await register(req({ email: "bounced@example.com", password: "correct-password" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      emailVerificationRequired: true,
      codeDelivered: false,
    });
    const user = await prisma.customer.findUnique({ where: { email: "bounced@example.com" } });
    expect(user).toBeTruthy();
  });

  it("records the rejected code email so a failing recovery path is queryable", async () => {
    sendCodeMock.mockRejectedValue(new Error("Resend rejected the message: API key is invalid"));

    await register(req({ email: "bounced@example.com", password: "correct-password" }));

    const log = await prisma.notificationLog.findFirstOrThrow({
      where: { kind: "auth_verification_code" },
    });
    expect(log.status).toBe("FAILED");
    expect(log.recipient).toBe("bounced@example.com");
    expect(log.error).toContain("API key is invalid");
  });

  // The provider's message is technical and untranslated; release criterion
  // §1.8 keeps that kind of string off the client.
  it("does not leak the provider's rejection message to the client", async () => {
    sendCodeMock.mockRejectedValue(new Error("Resend rejected the message: API key is invalid"));

    const res = await register(req({ email: "bounced@example.com", password: "correct-password" }));

    expect(JSON.stringify(await res.json())).not.toContain("Resend");
  });

  // Why answering "registration failed" was the wrong call: the retry that fixes
  // a transient outage is re-registering the same unverified account.
  it("lets the same address retry and succeed once delivery recovers", async () => {
    sendCodeMock.mockRejectedValueOnce(new Error("Resend rejected the message"));
    await register(req({ email: "bounced@example.com", password: "correct-password" }));
    await prisma.rateLimit.deleteMany(); // U8 allows one send per address per minute

    const retry = await register(req({ email: "bounced@example.com", password: "correct-password" }));

    expect(retry.status).toBe(201);
    expect(await retry.json()).toEqual({ ok: true, emailVerificationRequired: true });
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

  // PRD U6: the taster a visitor took before signing up should follow them in.
  it("claims the guest exam session the visitor arrived with", async () => {
    await prisma.examSession.create({
      data: {
        id: "guest-taster",
        userId: null,
        certLevel: "BASIC",
        locale: "EN",
        questionIds: "[]",
        answers: "{}",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * 60_000),
      },
    });

    const res = await register(req({
      email: "claimer@test.local",
      password: "correct horse battery",
      guestExamSessionId: "guest-taster",
    }));
    expect(res.status).toBe(201);

    const session = await prisma.examSession.findUniqueOrThrow({ where: { id: "guest-taster" } });
    const user = await prisma.customer.findUniqueOrThrow({ where: { email: "claimer@test.local" } });
    expect(session.userId).toBe(user.id);
  });

  it("registers fine when the session id cannot be claimed", async () => {
    const res = await register(req({
      email: "noclaim@test.local",
      password: "correct horse battery",
      guestExamSessionId: "does-not-exist",
    }));

    expect(res.status).toBe(201);
  });
});
