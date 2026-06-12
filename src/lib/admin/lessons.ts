import { prisma } from "../db";
import type { Course } from "../lessons/types";

/** Locates a lesson by its cuid id across both course tables. Lesson ids are
 *  cuids (globally unique), so a plain id lookup is unambiguous. */
export async function findLessonById(id: string) {
  const basic = await prisma.basicLesson.findUnique({ where: { id } });
  if (basic) return { course: "basic" as Course, row: basic };
  const advanced = await prisma.advancedLesson.findUnique({ where: { id } });
  if (advanced) return { course: "advanced" as Course, row: advanced };
  return null;
}
