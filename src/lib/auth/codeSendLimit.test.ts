import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { CODE_SEND_DAILY, enforceCodeSendLimit } from "./codeSendLimit";

const ADDRESS = "limit@test.local";

describe("verification email send limits (PRD U8)", () => {
  beforeEach(async () => {
    await prisma.rateLimit.deleteMany();
  });
  afterAll(async () => {
    await prisma.rateLimit.deleteMany();
    await prisma.$disconnect();
  });

  it("allows the first send and refuses an immediate second", async () => {
    expect(await enforceCodeSendLimit("register", ADDRESS)).toBeNull();

    const second = await enforceCodeSendLimit("register", ADDRESS);

    expect(second?.status).toBe(429);
    expect(second?.headers.get("Retry-After")).toBeTruthy();
  });

  it("caps the address at 10 sends a day once the burst window is out of the way", async () => {
    // Clear the per-minute key between sends so only the daily budget applies.
    for (let i = 0; i < CODE_SEND_DAILY.limit; i++) {
      await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "register:burst:" } } });
      expect(await enforceCodeSendLimit("register", ADDRESS), `send ${i + 1}`).toBeNull();
    }

    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "register:burst:" } } });
    expect((await enforceCodeSendLimit("register", ADDRESS))?.status).toBe(429);
  });

  it("treats the address case-insensitively — casing is not a fresh budget", async () => {
    expect(await enforceCodeSendLimit("register", ADDRESS)).toBeNull();
    expect((await enforceCodeSendLimit("register", "  LIMIT@TEST.LOCAL "))?.status).toBe(429);
  });

  it("keeps registration and password-reset budgets separate", async () => {
    expect(await enforceCodeSendLimit("register", ADDRESS)).toBeNull();
    expect((await enforceCodeSendLimit("register", ADDRESS))?.status).toBe(429);

    // Exhausting one must not lock a legitimate user out of the other.
    expect(await enforceCodeSendLimit("forgot", ADDRESS)).toBeNull();
  });

  it("counts unregistered addresses too, so the limit reveals nothing", async () => {
    // No Customer row exists for either address; both burn their budget the same.
    expect(await enforceCodeSendLimit("forgot", "nobody@test.local")).toBeNull();
    expect((await enforceCodeSendLimit("forgot", "nobody@test.local"))?.status).toBe(429);
  });
});
