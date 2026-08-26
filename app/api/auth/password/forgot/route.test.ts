import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../../../src/lib/db";

// Mock the email sender so we can assert "sent" vs "not sent" without Resend.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("../../../../../src/lib/auth/delivery", () => ({ sendPasswordResetLink: sendMock }));

import { POST as forgot } from "./route";

const EMAIL = "forgot-user@example.com";
const MISSING = "nobody-forgot@example.com";

function req(body: unknown) {
  return new Request("http://test/api/auth/password/forgot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function cleanup() {
  await prisma.verificationCode.deleteMany({ where: { target: { in: [EMAIL, MISSING] } } });
  await prisma.customer.deleteMany({ where: { email: { in: [EMAIL, MISSING] } } });
  await prisma.rateLimit.deleteMany(); // U8: reset the per-address send budget between cases
}

describe("POST /api/auth/password/forgot", () => {
  beforeEach(async () => {
    sendMock.mockReset();
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("stores a reset token and emails a link when the account exists", async () => {
    await prisma.customer.create({
      data: { email: EMAIL, hashedPassword: "x", emailVerifiedAt: new Date(), accessTier: "FREE" },
    });

    const res = await forgot(req({ email: EMAIL, locale: "en" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const { to, link } = sendMock.mock.calls[0][0] as { to: string; link: string };
    expect(to).toBe(EMAIL);
    expect(link).toContain("/en/reset-password");
    expect(link).toContain("token=");

    const token = await prisma.verificationCode.findFirst({
      where: { channel: "email_reset", target: EMAIL },
    });
    expect(token).toBeTruthy();
  });

  it("returns the same generic 200 but sends nothing when no account exists", async () => {
    const res = await forgot(req({ email: MISSING, locale: "en" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(sendMock).not.toHaveBeenCalled();
    const token = await prisma.verificationCode.findFirst({
      where: { channel: "email_reset", target: MISSING },
    });
    expect(token).toBeNull();
  });

  it("rejects an invalid body", async () => {
    expect((await forgot(req({ email: "not-an-email" }))).status).toBe(400);
  });

  // PRD U8: the same uniform 200 protects against enumeration; the send limit
  // must not reintroduce a difference between a real and an unknown address.
  it("responds identically to a registered and an unknown address when rate-limited", async () => {
    await prisma.customer.create({ data: { email: EMAIL, hashedPassword: "x" } });

    const known = await forgot(req({ email: EMAIL }));
    const unknown = await forgot(req({ email: MISSING }));
    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());

    const knownAgain = await forgot(req({ email: EMAIL }));
    const unknownAgain = await forgot(req({ email: MISSING }));
    expect(knownAgain.status).toBe(429);
    expect(unknownAgain.status).toBe(429);
    expect(await knownAgain.json()).toEqual(await unknownAgain.json());
  });
});
