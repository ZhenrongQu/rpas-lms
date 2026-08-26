import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { claimGuestSession } from "./guestClaim";
import { GUEST_SESSION_TTL_MS } from "./config";

const OWNER = "claim-owner";
const OTHER = "claim-other";

async function reset() {
  await prisma.examSession.deleteMany();
  await prisma.customer.deleteMany({ where: { id: { in: [OWNER, OTHER] } } });
}

async function seedSession(id: string, userId: string | null, startedAt: Date) {
  await prisma.examSession.create({
    data: {
      id,
      userId,
      certLevel: "BASIC",
      locale: "EN",
      questionIds: "[]",
      answers: "{}",
      startedAt,
      expiresAt: new Date(startedAt.getTime() + 90 * 60_000),
      submitted: false,
    },
  });
}

describe("guest exam session claim (PRD U6)", () => {
  beforeEach(async () => {
    await reset();
    await prisma.customer.createMany({
      data: [
        { id: OWNER, email: "owner@test.local" },
        { id: OTHER, email: "other@test.local" },
      ],
    });
  });
  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("attaches a fresh ownerless session to the new account", async () => {
    await seedSession("s1", null, new Date());

    expect(await claimGuestSession("s1", OWNER)).toBe(true);

    const session = await prisma.examSession.findUniqueOrThrow({ where: { id: "s1" } });
    expect(session.userId).toBe(OWNER);
  });

  it("refuses a session that already belongs to someone — this is the escalation guard", async () => {
    await seedSession("s2", OWNER, new Date());

    expect(await claimGuestSession("s2", OTHER)).toBe(false);

    const session = await prisma.examSession.findUniqueOrThrow({ where: { id: "s2" } });
    expect(session.userId).toBe(OWNER); // untouched
  });

  it("refuses a session past its 24-hour lifetime", async () => {
    await seedSession("s3", null, new Date(Date.now() - GUEST_SESSION_TTL_MS - 60_000));

    expect(await claimGuestSession("s3", OWNER)).toBe(false);

    const session = await prisma.examSession.findUniqueOrThrow({ where: { id: "s3" } });
    expect(session.userId).toBeNull();
  });

  it("still accepts a session just inside the window", async () => {
    await seedSession("s4", null, new Date(Date.now() - GUEST_SESSION_TTL_MS + 60_000));

    expect(await claimGuestSession("s4", OWNER)).toBe(true);
  });

  it("reports failure for an unknown session rather than throwing", async () => {
    expect(await claimGuestSession("no-such-session", OWNER)).toBe(false);
  });

  it("lets only one of two simultaneous claims win", async () => {
    await seedSession("s5", null, new Date());

    const results = await Promise.all([
      claimGuestSession("s5", OWNER),
      claimGuestSession("s5", OTHER),
    ]);

    expect(results.filter(Boolean).length).toBe(1);
  });
});
