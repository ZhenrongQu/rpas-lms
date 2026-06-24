import {
  getCourseLessonCount,
  getCourseModules,
  getLesson,
  getModuleLessons,
} from "../lessons/catalog";
import {
  lessonExists,
  listCompletedLessonIds,
  markLessonComplete,
} from "../lessons/progress";
import type { AccessTier } from "../exam/access";
import type { Course, RouteLocale } from "../lessons/types";

export type MobileLessonBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "callout"; tone: "tip" | "caution" | "note"; text: string };

export type ParsedMobileLessonId = {
  course: Course;
  moduleId: string;
  slug: string;
};

export function mdxToMobileBlocks(body: string): MobileLessonBlock[] {
  const blocks: MobileLessonBlock[] = [];
  const lines = body.split(/\r?\n/);
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let ordered = false;

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  }

  function flushList() {
    if (listItems.length) {
      blocks.push({ type: "list", ordered, items: listItems });
      listItems = [];
      ordered = false;
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const callout = line.match(/^<Callout type="(tip|caution|note)">(.+)<\/Callout>$/);
    if (callout) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "callout",
        tone: callout[1] as "tip" | "caution" | "note",
        text: callout[2],
      });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (listItems.length && ordered) flushList();
      ordered = false;
      listItems.push(bullet[1]);
      continue;
    }

    const number = line.match(/^\d+\.\s+(.+)$/);
    if (number) {
      flushParagraph();
      if (listItems.length && !ordered) flushList();
      ordered = true;
      listItems.push(number[1]);
      continue;
    }

    if (line.startsWith("<") && line.endsWith(">")) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

export function parseMobileLessonId(lessonId: string): ParsedMobileLessonId | null {
  const parts = lessonId.split("/");
  if (parts.length !== 3) return null;

  const [course, moduleId, slug] = parts;
  if ((course !== "basic" && course !== "advanced") || !moduleId || !slug) return null;
  return { course, moduleId, slug };
}

export function normalizeMobileLessonIdParam(lessonId: string | string[]): string | null {
  const rawParts = Array.isArray(lessonId) ? lessonId : [lessonId];

  try {
    const decodedParts = rawParts.map((part) => decodeURIComponent(part));
    if (decodedParts.length === 1) return decodedParts[0];
    return decodedParts.join("/");
  } catch {
    return null;
  }
}

export async function getMobileCourses({
  userId,
  locale,
  accessTier,
}: {
  userId: string;
  locale: RouteLocale;
  accessTier: AccessTier;
}) {
  const completed = new Set(await listCompletedLessonIds(userId));
  const courses: Course[] = ["basic", "advanced"];

  return Promise.all(
    courses.map(async (course) => {
      const modules = await getCourseModules(locale, course);
      const lessonTotal = await getCourseLessonCount(course);
      const done = [...completed].filter((id) => id.startsWith(`${course}/`)).length;

      return {
        course,
        title: course === "basic" ? "Basic" : "Advanced",
        locked: course === "advanced" && accessTier !== "PAID",
        done,
        total: lessonTotal,
        modules: await Promise.all(
          modules.map(async (moduleId) => ({
            moduleId,
            lessons: (await getModuleLessons(locale, course, moduleId)).map((lesson) => ({
              ...lesson,
              completed: completed.has(lesson.lessonId),
            })),
          })),
        ),
      };
    }),
  );
}

export async function getMobileLesson({
  userId,
  lessonId,
  locale,
  accessTier,
}: {
  userId: string;
  lessonId: string;
  locale: RouteLocale;
  accessTier: AccessTier;
}) {
  const parsed = parseMobileLessonId(lessonId);
  if (!parsed) return null;
  if (parsed.course === "advanced" && accessTier !== "PAID") return { locked: true as const };

  const lesson = await getLesson(locale, parsed.course, parsed.moduleId, parsed.slug);
  if (!lesson) return null;

  const completed = new Set(await listCompletedLessonIds(userId));
  return {
    locked: false as const,
    meta: lesson.meta,
    completed: completed.has(lessonId),
    blocks: mdxToMobileBlocks(lesson.body),
  };
}

export async function completeMobileLesson(
  userId: string,
  lessonId: string,
  accessTier: AccessTier,
) : Promise<"ok" | "not_found" | "forbidden" | "invalid_lesson_id"> {
  const parsed = parseMobileLessonId(lessonId);
  if (!parsed) return "invalid_lesson_id";
  if (parsed?.course === "advanced" && accessTier !== "PAID") return "forbidden";
  if (!(await lessonExists(lessonId))) return "not_found";
  await markLessonComplete(userId, lessonId);
  return "ok";
}
