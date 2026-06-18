import { prisma } from "../db";
import { MODULE_IDS } from "../content/types";
import type { Course, RouteLocale } from "./types";

export interface ResumeLesson {
  lessonId: string;
  title: string;
}

/** The first lesson (in canonical module + `order`) the user has not completed,
 *  or null if the whole course is done. Powers the dashboard "Continue learning"
 *  hero. One lean query (no MDX bodies) + an in-memory sort, so it stays cheap
 *  even for courses with many modules/lessons. */
export async function getResumeLesson(
  locale: RouteLocale,
  course: Course,
  completed: Set<string>,
): Promise<ResumeLesson | null> {
  const select = { lessonId: true, moduleId: true, order: true, titleEN: true, titleZH: true };
  const rows =
    course === "basic"
      ? await prisma.basicLesson.findMany({ select })
      : await prisma.advancedLesson.findMany({ select });

  const order = MODULE_IDS as readonly string[];
  rows.sort((a, b) => {
    const byModule = order.indexOf(a.moduleId) - order.indexOf(b.moduleId);
    return byModule !== 0 ? byModule : a.order - b.order;
  });

  const next = rows.find((r) => !completed.has(r.lessonId));
  if (!next) return null;
  return { lessonId: next.lessonId, title: locale === "zh" ? next.titleZH : next.titleEN };
}
