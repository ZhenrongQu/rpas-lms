import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../db";
import { markLessonComplete, listCompletedLessonIds } from "./progress";

// Seeded placeholder lessonIds (see scripts/seed-content.ts). Progress FKs to a
// real lesson row, so these must exist.
const BASIC_LESSON = "basic/air-law/intro-1";
const ADVANCED_LESSON = "advanced/air-law/adv-1";

describe("lesson progress", () => {
  beforeEach(async () => {
    await prisma.basicLessonProgress.deleteMany();
    await prisma.advancedLessonProgress.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.customer.create({ data: { id: "u1", email: "u1@test.local", hashedPassword: "x" } });
    await prisma.customer.create({ data: { id: "u2", email: "u2@test.local", hashedPassword: "x" } });
  });
  afterAll(async () => {
    await prisma.basicLessonProgress.deleteMany();
    await prisma.advancedLessonProgress.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.$disconnect();
  });

  it("marks a lesson complete and lists it (idempotent)", async () => {
    await markLessonComplete("u1", BASIC_LESSON);
    await markLessonComplete("u1", BASIC_LESSON); // again → no duplicate
    const ids = await listCompletedLessonIds("u1");
    expect(ids).toEqual([BASIC_LESSON]);
  });

  it("isolates progress per user across basic + advanced", async () => {
    await markLessonComplete("u1", BASIC_LESSON);
    await markLessonComplete("u2", ADVANCED_LESSON);
    expect(await listCompletedLessonIds("u1")).toEqual([BASIC_LESSON]);
    expect(await listCompletedLessonIds("u2")).toEqual([ADVANCED_LESSON]);
  });
});
