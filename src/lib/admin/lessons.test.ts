import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { createLesson } from "./lessons";

// An isolated module id no fixture uses, so the shared dev DB is untouched.
const MOD = "zzz-lesson-create-test";

const base = {
  moduleId: MOD,
  order: 1,
  estMinutes: 5,
  certLevel: "BASIC",
  access: "FREE",
  titleEN: "T",
  titleZH: "标题",
  bodyEN: "",
  bodyZH: "",
};

async function cleanup() {
  await prisma.basicLesson.deleteMany({ where: { moduleId: MOD } });
  await prisma.advancedLesson.deleteMany({ where: { moduleId: MOD } });
}

describe("createLesson", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("creates a basic lesson with a derived lessonId", async () => {
    const res = await createLesson({ ...base, course: "basic", slug: "intro" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row.course).toBe("basic");
    expect(res.row.lessonId).toBe(`basic/${MOD}/intro`);
    expect(res.row.id).toBeTruthy();
    expect(await prisma.basicLesson.count({ where: { moduleId: MOD } })).toBe(1);
  });

  it("creates an advanced lesson in the advanced table", async () => {
    const res = await createLesson({ ...base, course: "advanced", slug: "intro" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row.lessonId).toBe(`advanced/${MOD}/intro`);
    expect(await prisma.advancedLesson.count({ where: { moduleId: MOD } })).toBe(1);
    expect(await prisma.basicLesson.count({ where: { moduleId: MOD } })).toBe(0);
  });

  it("reports DUPLICATE when the same course/module/slug already exists", async () => {
    const first = await createLesson({ ...base, course: "basic", slug: "dupe" });
    expect(first.ok).toBe(true);
    const second = await createLesson({ ...base, course: "basic", slug: "dupe" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("DUPLICATE");
  });
});
