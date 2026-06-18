import { prisma } from "../db";
import { dbCheckpointToQuestion, dbQuestionToQuestion, dbQuestionsToQuestionBank } from "./dbMappers";
import type { ExamCertLevel, Question, QuestionBank } from "./types";

/** Loads the ACTIVE question bank for a certification level from the database
 *  (no long-lived cache). Basic and advanced questions live in separate tables. */
export async function loadQuestionBankFromDB(level: ExamCertLevel): Promise<QuestionBank> {
  const rows =
    level === "BASIC"
      ? await prisma.basicQuestionBank.findMany({
          where: { status: "ACTIVE" },
          include: { options: true },
        })
      : await prisma.advancedQuestionBank.findMany({
          where: { status: "ACTIVE" },
          include: { options: true },
        });
  return dbQuestionsToQuestionBank(rows);
}

/** Finds a single ACTIVE question by id across both banks (basic first), or null.
 *  Used by lesson checkpoints, which reference a question id without knowing the
 *  bank. Ids are bank-prefixed and globally unique, so the first hit is correct. */
export async function findActiveQuestion(id: string): Promise<Question | null> {
  const basic = await prisma.basicQuestionBank.findFirst({
    where: { id, status: "ACTIVE" },
    include: { options: true },
  });
  if (basic) return dbQuestionToQuestion(basic);
  const advanced = await prisma.advancedQuestionBank.findFirst({
    where: { id, status: "ACTIVE" },
    include: { options: true },
  });
  if (advanced) return dbQuestionToQuestion(advanced);
  return null;
}

/** Finds a single ACTIVE checkpoint question by id, or null. Reads the dedicated
 *  CheckpointQuestion table — never the exam banks — so checkpoint endpoints can
 *  never expose exam answers (SEC-04). */
export async function findActiveCheckpoint(id: string): Promise<Question | null> {
  const row = await prisma.checkpointQuestion.findFirst({
    where: { id, status: "ACTIVE" },
    include: { options: true },
  });
  return row ? dbCheckpointToQuestion(row) : null;
}

/** Ordered ACTIVE checkpoint question ids assigned to a lesson; rendered at the
 *  bottom of that lesson. */
export async function getLessonCheckpointIds(lessonId: string): Promise<string[]> {
  const rows = await prisma.checkpointQuestion.findMany({
    where: { lessonId, status: "ACTIVE" },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
