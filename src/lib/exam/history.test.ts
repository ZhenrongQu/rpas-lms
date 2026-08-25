import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../db";
import { listUserExamHistory } from "./history";

async function seedSession(
  id: string,
  userId: string | null,
  startedAt: number,
  submitted: boolean,
  expiresAt = startedAt + 1000,
) {
  await prisma.examSession.create({
    data: {
      id,
      userId,
      certLevel: "BASIC",
      locale: "EN",
      questionIds: "[]",
      answers: "{}",
      startedAt: new Date(startedAt),
      expiresAt: new Date(expiresAt),
      submitted,
      result: submitted
        ? JSON.stringify({ total: 35, correct: 30, scorePct: 30 / 35, passed: true, bySubject: [] })
        : null,
    },
  });
}

describe("listUserExamHistory", () => {
  beforeEach(async () => {
    await prisma.examSession.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.customer.create({ data: { id: "u1", email: "u1@test.local", hashedPassword: "x" } });
    await prisma.customer.create({ data: { id: "u2", email: "u2@test.local", hashedPassword: "x" } });
  });
  afterAll(async () => {
    await prisma.examSession.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.$disconnect();
  });

  it("returns a user's sessions newest-first and excludes other users", async () => {
    await seedSession("a", "u1", 1_000, true);
    await seedSession("b", "u1", 3_000, false, Date.now() + 60_000); // still running
    await seedSession("c", "u2", 2_000, true);

    const history = await listUserExamHistory("u1");
    expect(history.map((h) => h.id)).toEqual(["b", "a"]);
    expect(history[1].scorePct).toBeCloseTo(30 / 35);
    expect(history[1].passed).toBe(true);
    expect(history[0].scorePct).toBeNull();
  });

  it("settles an expired unsubmitted session instead of listing it as in progress (DEF-002)", async () => {
    await seedSession("d", "u1", 1_000, false); // expired in 1970 and never submitted

    const history = await listUserExamHistory("u1");

    expect(history[0].id).toBe("d");
    expect(history[0].submitted).toBe(true);
    expect(history[0].scorePct).toBe(0); // no answers were saved before the timeout
    expect(history[0].passed).toBe(false);
  });
});
