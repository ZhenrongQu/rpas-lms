import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../../src/lib/db";
import { requestVerificationCode } from "../../../../../src/lib/auth/verificationCode";
import { POST as register } from "../route";
import { POST as verifyEmail } from "./route";

function post(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register/verify-email", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("verifies the pending registration email", async () => {
    await register(post("http://test/api/auth/register", {
      email: "pilot@example.com",
      password: "correct-password",
    }));
    await requestVerificationCode({
      channel: "email",
      target: "pilot@example.com",
      codeFactory: () => "123456",
    });

    const res = await verifyEmail(post("http://test/api/auth/register/verify-email", {
      email: "pilot@example.com",
      code: "123456",
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "pilot@example.com" } });
    expect(user.emailVerifiedAt).toBeTruthy();

    const identity = await prisma.userIdentity.findUniqueOrThrow({
      where: {
        provider_providerAccountId: {
          provider: "email",
          providerAccountId: "pilot@example.com",
        },
      },
    });
    expect(identity.verifiedAt).toBeTruthy();
  });

  it("rejects invalid codes", async () => {
    const res = await verifyEmail(post("http://test/api/auth/register/verify-email", {
      email: "pilot@example.com",
      code: "000000",
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_or_expired" });
  });
});
