import { describe, it, expect } from "vitest";
import {
  getModuleLessons,
  getCourseModules,
  getLesson,
  getModuleLessonCount,
  getCourseLessonCount,
} from "./catalog";

describe("lesson catalog", () => {
  it("lists Basic Air Law lessons in order with metadata (EN)", () => {
    const lessons = getModuleLessons("en", "basic", "air-law");
    expect(lessons.length).toBe(2);
    expect(lessons[0].lessonId).toBe("basic/air-law/getting-started");
    expect(lessons[0].course).toBe("basic");
    expect(lessons[0].moduleId).toBe("air-law");
    expect(lessons[0].slug).toBe("getting-started");
    expect(lessons[0].order).toBe(1);
    expect(lessons[0].access).toBe("FREE");
    expect(lessons[0].certLevel).toBe("BASIC");
    expect(lessons[1].slug).toBe("operating-limits");
    const orders = lessons.map((l) => l.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("returns localized titles for ZH", () => {
    const [first] = getModuleLessons("zh", "basic", "air-law");
    expect(first.title).toBe("入门：证书、注册与法律");
    expect(first.lessonId).toBe("basic/air-law/getting-started");
  });

  it("marks advanced lessons PAID/ADVANCED", () => {
    const [adv] = getModuleLessons("en", "advanced", "air-law");
    expect(adv.access).toBe("PAID");
    expect(adv.certLevel).toBe("ADVANCED");
    expect(adv.lessonId).toBe("advanced/air-law/advanced-operating-environments");
  });

  it("loads a single lesson body + meta, or null when missing", () => {
    const lesson = getLesson("en", "basic", "air-law", "operating-limits");
    expect(lesson).not.toBeNull();
    expect(lesson!.meta.lessonId).toBe("basic/air-law/operating-limits");
    expect(lesson!.body).toContain("VLOS");
    expect(lesson!.body).not.toContain("order:"); // frontmatter stripped
    expect(getLesson("en", "basic", "air-law", "nope")).toBeNull();
  });

  it("lists course modules in canonical order (radiotelephony only in advanced)", () => {
    const basic = getCourseModules("en", "basic");
    expect(basic).toContain("air-law");
    expect(basic).not.toContain("radiotelephony");
    expect(basic.length).toBe(7);

    const advanced = getCourseModules("en", "advanced");
    expect(advanced).toContain("radiotelephony");
    expect(advanced.length).toBe(5);
  });

  it("counts lessons per module and per course from the canonical (EN) tree", () => {
    expect(getModuleLessonCount("basic", "air-law")).toBe(2);
    expect(getModuleLessonCount("basic", "radiotelephony")).toBe(0); // advanced-only
    expect(getCourseLessonCount("basic")).toBe(8);
    expect(getCourseLessonCount("advanced")).toBe(5);
  });
});
