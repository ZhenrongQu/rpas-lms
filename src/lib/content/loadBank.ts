import { prisma } from "../db";
import { dbQuestionToQuestion, dbQuestionsToQuestionBank } from "./dbMappers";
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
