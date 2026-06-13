import { Prisma } from "@prisma/client";
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

export type LessonCreateData = {
  course: Course;
  moduleId: string;
  slug: string;
  order: number;
  estMinutes: number;
  certLevel: string;
  access: string;
  titleEN: string;
  titleZH: string;
  bodyEN: string;
  bodyZH: string;
};

/** Creates a lesson in the table named by `course`. `lessonId` is derived as
 *  `${course}/${moduleId}/${slug}` (the stable key referenced by LessonProgress).
 *  Relies on the DB unique constraints to detect collisions (no check-then-insert
 *  race): a Prisma P2002 maps to `{ ok: false, reason: "DUPLICATE" }`. */
export async function createLesson(input: LessonCreateData) {
  const lessonId = `${input.course}/${input.moduleId}/${input.slug}`;
  const data = {
    lessonId,
    course: input.course,
    moduleId: input.moduleId,
    slug: input.slug,
    order: input.order,
    estMinutes: input.estMinutes,
    certLevel: input.certLevel,
    access: input.access,
    titleEN: input.titleEN,
    titleZH: input.titleZH,
    bodyEN: input.bodyEN,
    bodyZH: input.bodyZH,
  };
  try {
    const row =
      input.course === "basic"
        ? await prisma.basicLesson.create({ data })
        : await prisma.advancedLesson.create({ data });
    return { ok: true as const, row };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false as const, reason: "DUPLICATE" as const };
    }
    throw e;
  }
}
