import { afterEach, describe, it, expect } from "vitest";
import { prisma } from "../db";
import {
  getModuleLessons,
  getCourseModules,
  getLesson,
  getModuleLessonCount,
  getCourseLessonCount,
} from "./catalog";

// Reads from the DB seeded by vitest.globalSetup (scripts/seed-test-fixtures.ts).
// Fixture lessons: basic/air-law/{intro-1,intro-2}, basic/meteorology/wx-1,
// advanced/air-law/adv-1, advanced/radiotelephony/rt-1.
describe("lesson catalog", () => {
  it("lists Basic Air Law lessons in order with metadata (EN)", async () => {
    const lessons = await getModuleLessons("en", "basic", "air-law");
    expect(lessons.length).toBe(2);
    expect(lessons[0].lessonId).toBe("basic/air-law/intro-1");
    expect(lessons[0].course).toBe("basic");
    expect(lessons[0].moduleId).toBe("air-law");
    expect(lessons[0].slug).toBe("intro-1");
    expect(lessons[0].order).toBe(1);
    expect(lessons[0].access).toBe("FREE");
    expect(lessons[0].certLevel).toBe("BASIC");
    expect(lessons[1].slug).toBe("intro-2");
    const orders = lessons.map((l) => l.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("returns localized titles for ZH", async () => {
    const [first] = await getModuleLessons("zh", "basic", "air-law");
    expect(first.title).toBe("航空法基础 1");
    expect(first.lessonId).toBe("basic/air-law/intro-1");
  });

  it("marks advanced lessons PAID/ADVANCED", async () => {
    const [adv] = await getModuleLessons("en", "advanced", "air-law");
    expect(adv.access).toBe("PAID");
    expect(adv.certLevel).toBe("ADVANCED");
    expect(adv.lessonId).toBe("advanced/air-law/adv-1");
  });

  it("loads a single lesson body + meta, or null when missing", async () => {
    const lesson = await getLesson("en", "basic", "air-law", "intro-1");
    expect(lesson).not.toBeNull();
    expect(lesson!.meta.lessonId).toBe("basic/air-law/intro-1");
    expect(lesson!.body).toContain("VLOS");
    expect(await getLesson("en", "basic", "air-law", "nope")).toBeNull();
  });

  it("lists course modules in canonical order (radiotelephony only in advanced)", async () => {
    const basic = await getCourseModules("en", "basic");
    expect(basic).toEqual(["air-law", "meteorology"]); // canonical order
    expect(basic).not.toContain("radiotelephony");

    const advanced = await getCourseModules("en", "advanced");
    expect(advanced).toContain("radiotelephony");
    expect(advanced).toEqual(["air-law", "radiotelephony"]);
  });

  it("counts lessons per module and per course", async () => {
    expect(await getModuleLessonCount("basic", "air-law")).toBe(2);
    expect(await getModuleLessonCount("basic", "radiotelephony")).toBe(0); // advanced-only
    expect(await getCourseLessonCount("basic")).toBe(3);
    expect(await getCourseLessonCount("advanced")).toBe(2);
  });

  // PRD U10: an untranslated lesson serves English rather than a blank page,
  // and says so — silently swapping languages reads as a bug.
  describe("single-language fallback", () => {
    const LESSON = { course: "basic", moduleId: "air-law", slug: "intro-1" };
    const where = { course_moduleId_slug: LESSON };

    async function setZhBody(bodyZH: string) {
      await prisma.basicLesson.update({ where, data: { bodyZH } });
    }

    afterEach(async () => {
      await prisma.basicLesson.update({ where, data: { bodyZH: "# 航空法基础 1\n\n中文正文。" } });
    });

    it("serves English and flags the fallback when the Chinese body is empty", async () => {
      await setZhBody("");

      const lesson = await getLesson("zh", "basic", "air-law", "intro-1");

      expect(lesson?.fellBackToEN).toBe(true);
      expect(lesson?.body).toContain("VLOS"); // the English fixture body
    });

    it("treats a whitespace-only body as missing, not as content", async () => {
      await setZhBody("   \n\t  ");

      const lesson = await getLesson("zh", "basic", "air-law", "intro-1");

      expect(lesson?.fellBackToEN).toBe(true);
      expect(lesson?.body.trim().length).toBeGreaterThan(0);
    });

    it("does not fall back when the translation exists", async () => {
      const lesson = await getLesson("zh", "basic", "air-law", "intro-1");

      expect(lesson?.fellBackToEN).toBe(false);
      expect(lesson?.body).toContain("中文");
    });

    it("never flags a fallback for the English reader", async () => {
      const lesson = await getLesson("en", "basic", "air-law", "intro-1");

      expect(lesson?.fellBackToEN).toBe(false);
    });
  });
});
