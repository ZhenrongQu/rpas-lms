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

  // PRD U11: a lesson can now be completed two ways — the button, and scrolling
  // to the end. Both go through markLessonComplete, so they must land on the same
  // row and revisiting must not undo anything.
  describe("automatic and manual completion", () => {
    it("auto and manual marking share one row rather than racing each other", async () => {
      await Promise.all([
        markLessonComplete("u1", BASIC_LESSON), // scrolled to the end
        markLessonComplete("u1", BASIC_LESSON), // pressed the button
      ]);

      expect(await prisma.basicLessonProgress.count({ where: { userId: "u1" } })).toBe(1);
    });

    it("revisiting a finished lesson does not clear it or move its timestamp", async () => {
      await markLessonComplete("u1", BASIC_LESSON);
      const first = await prisma.basicLessonProgress.findFirstOrThrow({ where: { userId: "u1" } });

      await markLessonComplete("u1", BASIC_LESSON); // reader comes back to review

      const second = await prisma.basicLessonProgress.findFirstOrThrow({ where: { userId: "u1" } });
      expect(second.id).toBe(first.id);
      expect(second.completedAt).toEqual(first.completedAt);
      expect(await listCompletedLessonIds("u1")).toEqual([BASIC_LESSON]);
    });
  });
});
