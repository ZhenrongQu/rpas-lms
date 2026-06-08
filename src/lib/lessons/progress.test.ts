import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../db";
import { markLessonComplete, listCompletedLessonIds } from "./progress";

describe("lesson progress", () => {
  beforeEach(async () => {
    await prisma.lessonProgress.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({ data: { id: "u1", email: "u1@test.local", hashedPassword: "x" } });
    await prisma.user.create({ data: { id: "u2", email: "u2@test.local", hashedPassword: "x" } });
  });
  afterAll(async () => {
    await prisma.lessonProgress.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("marks a lesson complete and lists it (idempotent)", async () => {
    await markLessonComplete("u1", "basic/air-law/getting-started");
    await markLessonComplete("u1", "basic/air-law/getting-started"); // again → no duplicate
    const ids = await listCompletedLessonIds("u1");
    expect(ids).toEqual(["basic/air-law/getting-started"]);
  });

  it("isolates progress per user", async () => {
    await markLessonComplete("u1", "basic/air-law/getting-started");
    await markLessonComplete("u2", "advanced/air-law/advanced-operating-environments");
    expect(await listCompletedLessonIds("u1")).toEqual(["basic/air-law/getting-started"]);
    expect(await listCompletedLessonIds("u2")).toEqual([
      "advanced/air-law/advanced-operating-environments",
    ]);
  });
});
