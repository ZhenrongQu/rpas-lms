import { prisma } from "../db";
import { MODULE_IDS } from "../content/types";
import { dbLessonBody, dbLessonToMeta } from "../content/dbMappers";
import type { Course, LessonMeta, RouteLocale } from "./types";

/** All lessons for a module in a course+locale, sorted by `order`. [] if none. */
export async function getModuleLessons(
  locale: RouteLocale,
  course: Course,
  moduleId: string,
): Promise<LessonMeta[]> {
  const rows =
    course === "basic"
      ? await prisma.basicLesson.findMany({ where: { moduleId }, orderBy: { order: "asc" } })
      : await prisma.advancedLesson.findMany({ where: { moduleId }, orderBy: { order: "asc" } });
  return rows.map((row) => dbLessonToMeta(row, locale));
}

/** Module ids that have at least one lesson in a course, in canonical order. */
export async function getCourseModules(_locale: RouteLocale, course: Course): Promise<string[]> {
  const rows =
    course === "basic"
      ? await prisma.basicLesson.findMany({ distinct: ["moduleId"], select: { moduleId: true } })
      : await prisma.advancedLesson.findMany({ distinct: ["moduleId"], select: { moduleId: true } });
  const present = new Set(rows.map((r) => r.moduleId));
  return MODULE_IDS.filter((id) => present.has(id));
}

/** One lesson's metadata + raw MDX body (frontmatter stripped) for a locale, or null. */
export async function getLesson(
  locale: RouteLocale,
  course: Course,
  moduleId: string,
  slug: string,
): Promise<{ meta: LessonMeta; body: string } | null> {
  const where = { course_moduleId_slug: { course, moduleId, slug } };
  const row =
    course === "basic"
      ? await prisma.basicLesson.findUnique({ where })
      : await prisma.advancedLesson.findUnique({ where });
  if (!row) return null;
  return { meta: dbLessonToMeta(row, locale), body: dbLessonBody(row, locale) };
}

/** Lesson count for a module in a course. */
export async function getModuleLessonCount(course: Course, moduleId: string): Promise<number> {
  return course === "basic"
    ? prisma.basicLesson.count({ where: { moduleId } })
    : prisma.advancedLesson.count({ where: { moduleId } });
}

/** Total lesson count for a whole course. */
export async function getCourseLessonCount(course: Course): Promise<number> {
  return course === "basic" ? prisma.basicLesson.count() : prisma.advancedLesson.count();
}
