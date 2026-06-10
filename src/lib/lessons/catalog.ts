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
  const rows = await prisma.lesson.findMany({
    where: { course, moduleId },
    orderBy: { order: "asc" },
  });
  return rows.map((row) => dbLessonToMeta(row, locale));
}

/** Module ids that have at least one lesson in a course, in canonical order. */
export async function getCourseModules(_locale: RouteLocale, course: Course): Promise<string[]> {
  const rows = await prisma.lesson.findMany({
    where: { course },
    distinct: ["moduleId"],
    select: { moduleId: true },
  });
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
  const row = await prisma.lesson.findUnique({
    where: { course_moduleId_slug: { course, moduleId, slug } },
  });
  if (!row) return null;
  return { meta: dbLessonToMeta(row, locale), body: dbLessonBody(row, locale) };
}

/** Lesson count for a module in a course. */
export async function getModuleLessonCount(course: Course, moduleId: string): Promise<number> {
  return prisma.lesson.count({ where: { course, moduleId } });
}

/** Total lesson count for a whole course. */
export async function getCourseLessonCount(course: Course): Promise<number> {
  return prisma.lesson.count({ where: { course } });
}
