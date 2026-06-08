import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { MODULE_IDS } from "../content/types";
import { FrontmatterSchema, type Course, type LessonMeta, type RouteLocale } from "./types";

const LESSONS_ROOT = join(process.cwd(), "content", "lessons");

function moduleDir(locale: RouteLocale, course: Course, moduleId: string): string {
  return join(LESSONS_ROOT, locale, course, moduleId);
}

function readMeta(
  locale: RouteLocale,
  course: Course,
  moduleId: string,
  slug: string,
): LessonMeta | null {
  const file = join(moduleDir(locale, course, moduleId), `${slug}.mdx`);
  if (!existsSync(file)) return null;
  const fm = FrontmatterSchema.parse(matter(readFileSync(file, "utf8")).data);
  return { lessonId: `${course}/${moduleId}/${slug}`, course, moduleId, slug, ...fm };
}

/** All lessons for a module in a course+locale, sorted by `order`. [] if none. */
export function getModuleLessons(
  locale: RouteLocale,
  course: Course,
  moduleId: string,
): LessonMeta[] {
  const dir = moduleDir(locale, course, moduleId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => readMeta(locale, course, moduleId, f.replace(/\.mdx$/, "")))
    .filter((m): m is LessonMeta => m !== null)
    .sort((a, b) => a.order - b.order);
}

/** Module ids that have at least one lesson in a course, in canonical order. */
export function getCourseModules(locale: RouteLocale, course: Course): string[] {
  return MODULE_IDS.filter((id) => getModuleLessons(locale, course, id).length > 0);
}

/** One lesson's metadata + raw MDX body (frontmatter stripped), or null. */
export function getLesson(
  locale: RouteLocale,
  course: Course,
  moduleId: string,
  slug: string,
): { meta: LessonMeta; body: string } | null {
  const meta = readMeta(locale, course, moduleId, slug);
  if (!meta) return null;
  const file = join(moduleDir(locale, course, moduleId), `${slug}.mdx`);
  const body = matter(readFileSync(file, "utf8")).content;
  return { meta, body };
}

/** Lesson count for a module in a course, from the canonical EN tree. */
export function getModuleLessonCount(course: Course, moduleId: string): number {
  return getModuleLessons("en", course, moduleId).length;
}

/** Total lesson count for a whole course, from the canonical EN tree. */
export function getCourseLessonCount(course: Course): number {
  return getCourseModules("en", course).reduce(
    (n, id) => n + getModuleLessonCount(course, id),
    0,
  );
}
