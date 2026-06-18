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

/** Upsert a completed lesson for a user (idempotent on [userId, lessonId]). */
export async function markLessonComplete(userId: string, lessonId: string): Promise<void> {
  if (isBasic(lessonId)) {
    await prisma.basicLessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId },
      update: {},
    });
  } else {
    await prisma.advancedLessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId },
      update: {},
    });
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
