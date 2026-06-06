import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../db";
import { listUserExamHistory } from "./history";

async function seedSession(id: string, userId: string | null, startedAt: number, submitted: boolean) {
  await prisma.examSession.create({
    data: {
      id,
      userId,
      certLevel: "BASIC",
      locale: "EN",
      questionIds: "[]",
      answers: "{}",
      startedAt: new Date(startedAt),
      expiresAt: new Date(startedAt + 1000),
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
    await prisma.user.deleteMany();
    await prisma.user.create({ data: { id: "u1", email: "u1@test.local", hashedPassword: "x" } });
    await prisma.user.create({ data: { id: "u2", email: "u2@test.local", hashedPassword: "x" } });
  });
  afterAll(async () => {
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("returns a user's sessions newest-first and excludes other users", async () => {
    await seedSession("a", "u1", 1_000, true);
    await seedSession("b", "u1", 3_000, false);
    await seedSession("c", "u2", 2_000, true);

    const history = await listUserExamHistory("u1");
    expect(history.map((h) => h.id)).toEqual(["b", "a"]);
    expect(history[1].scorePct).toBeCloseTo(30 / 35);
    expect(history[1].passed).toBe(true);
    expect(history[0].scorePct).toBeNull();
  });
});
