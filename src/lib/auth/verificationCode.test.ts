import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  normalizeTarget,
  requestVerificationCode,
  verifyCode,
} from "./verificationCode";

describe("verification code service", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
  });

  afterAll(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.$disconnect();
  });

  it("normalizes email and phone targets", () => {
    expect(normalizeTarget("email", " Pilot@Example.COM ")).toBe("pilot@example.com");
    expect(normalizeTarget("sms", "(604) 555-1234")).toBe("+16045551234");
    expect(normalizeTarget("sms", "+1 604 555 1234")).toBe("+16045551234");
  });

  it("stores only a hash and verifies the plain 6-digit code once", async () => {
    const requested = await requestVerificationCode({
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
      codeFactory: () => "123456",
    });

    const row = await prisma.verificationCode.findUniqueOrThrow({
      where: { id: requested.id },
    });
    expect(row.codeHash).not.toBe("123456");
    expect(row.consumedAt).toBeNull();

    const first = await verifyCode({
      channel: "email",
      target: "pilot@example.com",
      code: "123456",
      now: () => new Date("2026-06-06T00:02:00.000Z"),
    });
    expect(first.ok).toBe(true);

    const second = await verifyCode({
      channel: "email",
      target: "pilot@example.com",
      code: "123456",
      now: () => new Date("2026-06-06T00:03:00.000Z"),
    });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("expected verification to fail");
    expect(second.reason).toBe("invalid_or_expired");
  });

  it("consumes prior active codes for the same target and channel", async () => {
    await requestVerificationCode({
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
      codeFactory: () => "111111",
    });

    const latest = await requestVerificationCode({
      channel: "email",
      target: " pilot@example.com ",
      now: () => new Date("2026-06-06T00:01:00.000Z"),
      codeFactory: () => "222222",
    });

    const oldResult = await verifyCode({
      channel: "email",
      target: "pilot@example.com",
      code: "111111",
      now: () => new Date("2026-06-06T00:02:00.000Z"),
    });
    expect(oldResult.ok).toBe(false);
    if (oldResult.ok) throw new Error("expected old verification code to fail");
    expect(oldResult.reason).toBe("invalid_or_expired");

    const newResult = await verifyCode({
      channel: "email",
      target: latest.target,
      code: "222222",
      now: () => new Date("2026-06-06T00:02:00.000Z"),
    });
    expect(newResult.ok).toBe(true);
  });

  it("rejects expired codes", async () => {
    await requestVerificationCode({
      channel: "sms",
      target: "+16045551234",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
      codeFactory: () => "111111",
    });

    const result = await verifyCode({
      channel: "sms",
      target: "+16045551234",
      code: "111111",
      now: () => new Date("2026-06-06T00:11:00.000Z"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected expired code to fail");
    expect(result.reason).toBe("invalid_or_expired");
  });

  it("locks after five failed attempts", async () => {
    await requestVerificationCode({
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
      codeFactory: () => "222222",
    });

    for (let i = 0; i < 5; i += 1) {
      await verifyCode({
        channel: "email",
        target: "pilot@example.com",
        code: "000000",
        now: () => new Date("2026-06-06T00:01:00.000Z"),
      });
    }

    const result = await verifyCode({
      channel: "email",
      target: "pilot@example.com",
      code: "222222",
      now: () => new Date("2026-06-06T00:02:00.000Z"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected locked code to fail");
    expect(result.reason).toBe("too_many_attempts");
  });

  // P1-4: a single-use code redeemed concurrently must succeed exactly once.
  it("consumes a correct code only once under concurrency", async () => {
    await requestVerificationCode({
      channel: "email",
      target: "race@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
      codeFactory: () => "424242",
    });

    const at = () => new Date("2026-06-06T00:01:00.000Z");
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        verifyCode({ channel: "email", target: "race@example.com", code: "424242", now: at }),
      ),
    );
    expect(results.filter((r) => r.ok).length).toBe(1);
  });

  // P1-4: concurrent wrong guesses must each be counted — no undercount that
  // would let an attacker exceed the 5-try cap.
  it("counts concurrent failed attempts atomically", async () => {
    await requestVerificationCode({
      channel: "email",
      target: "brute@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
      codeFactory: () => "999999",
    });

    const at = () => new Date("2026-06-06T00:01:00.000Z");
    await Promise.all(
      Array.from({ length: 5 }, () =>
        verifyCode({ channel: "email", target: "brute@example.com", code: "000000", now: at }),
      ),
    );

    const row = await prisma.verificationCode.findFirstOrThrow({
      where: { channel: "email", target: "brute@example.com" },
    });
    expect(row.attempts).toBe(5);
  });
});
