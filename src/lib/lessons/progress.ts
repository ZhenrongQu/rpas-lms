import { Prisma } from "@prisma/client";
import { prisma } from "../db";

/** lessonId is "${course}/${moduleId}/${slug}"; basic vs advanced progress are
 *  physically separate tables, routed by the course prefix. */
function isBasic(lessonId: string): boolean {
  return lessonId.startsWith("basic/");
}

/** True if the lessonId resolves to a real lesson in its course table (SEC-03).
 *  Lets the route reject unknown lessonIds with a clean 404 instead of letting
 *  the progress→lesson foreign key throw an unhandled 500. */
export async function lessonExists(lessonId: string): Promise<boolean> {
  const row = isBasic(lessonId)
    ? await prisma.basicLesson.findUnique({ where: { lessonId }, select: { lessonId: true } })
    : await prisma.advancedLesson.findUnique({ where: { lessonId }, select: { lessonId: true } });
  return row !== null;
}

/**
 * Records a lesson as completed for a user. Idempotent on [userId, lessonId],
 * and `update: {}` means revisiting never moves the original completedAt.
 *
 * P2002 is swallowed because a lesson now has two completion triggers (PRD U11):
 * the button and scrolling to the end. Those can fire within milliseconds of each
 * other, and a Prisma upsert is not atomic against a concurrent insert — the
 * loser's create hits the unique constraint. The row existing IS the outcome both
 * callers wanted, so a duplicate-key collision here is success, not failure.
 */
export async function markLessonComplete(userId: string, lessonId: string): Promise<void> {
  const upsert = isBasic(lessonId)
    ? prisma.basicLessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId },
        update: {},
      })
    : prisma.advancedLessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId },
        update: {},
      });

  try {
    await upsert;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
}

/** All completed lessonIds for a user, across both basic and advanced. */
export async function listCompletedLessonIds(userId: string): Promise<string[]> {
  const [basic, advanced] = await Promise.all([
    prisma.basicLessonProgress.findMany({ where: { userId }, select: { lessonId: true } }),
    prisma.advancedLessonProgress.findMany({ where: { userId }, select: { lessonId: true } }),
  ]);
  return [...basic, ...advanced].map((r) => r.lessonId);
}
