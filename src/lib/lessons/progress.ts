import { prisma } from "../db";

/** Upsert a completed lesson for a user (idempotent on [userId, lessonId]). */
export async function markLessonComplete(userId: string, lessonId: string): Promise<void> {
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId },
    update: {},
  });
}

/** All completed lessonIds for a user. */
export async function listCompletedLessonIds(userId: string): Promise<string[]> {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId },
    select: { lessonId: true },
  });
  return rows.map((r) => r.lessonId);
}
