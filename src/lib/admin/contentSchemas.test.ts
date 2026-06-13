import { describe, it, expect } from "vitest";
import { adminLessonCreateSchema } from "./contentSchemas";

// "air-law" is a real entry in MODULE_IDS (it is the default module in the
// admin questions UI), so it satisfies the moduleId enum.
const base = {
  course: "basic",
  moduleId: "air-law",
  slug: "intro-to-air-law",
  titleEN: "Intro",
  titleZH: "介绍",
  order: 1,
  estMinutes: 5,
  certLevel: "BASIC",
  access: "FREE",
  bodyEN: "Some body.",
  bodyZH: "正文。",
};

describe("adminLessonCreateSchema", () => {
  it("accepts a complete valid payload", () => {
    expect(adminLessonCreateSchema.safeParse(base).success).toBe(true);
  });

  it("accepts empty bodies (video-only lessons)", () => {
    const r = adminLessonCreateSchema.safeParse({ ...base, bodyEN: "", bodyZH: "" });
    expect(r.success).toBe(true);
  });

  it("rejects a missing title", () => {
    const { titleEN, ...rest } = base;
    expect(adminLessonCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-kebab slugs", () => {
    for (const slug of ["Bad Slug", "a_b", "-x", "x-", "UPPER"]) {
      expect(adminLessonCreateSchema.safeParse({ ...base, slug }).success).toBe(false);
    }
  });

  it("accepts a valid kebab slug with digits", () => {
    expect(adminLessonCreateSchema.safeParse({ ...base, slug: "module-01-intro" }).success).toBe(true);
  });

  it("rejects order below 1", () => {
    expect(adminLessonCreateSchema.safeParse({ ...base, order: 0 }).success).toBe(false);
  });

  it("rejects an unknown course", () => {
    expect(adminLessonCreateSchema.safeParse({ ...base, course: "expert" }).success).toBe(false);
  });
});
