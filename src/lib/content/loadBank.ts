import bankJson from "../../../content/question-bank.json";
import { prisma } from "../db";
import { dbQuestionToQuestion, dbQuestionsToQuestionBank } from "./dbMappers";
import { QuestionBankSchema } from "./schema";
import type { ExamCertLevel, Question, QuestionBank } from "./types";

let cached: QuestionBank | null = null;

type RawLocalized = { EN: string; ZH?: string };
type RawMedia = { kind: string; url: string; alt: RawLocalized };

function localized(value: RawLocalized) {
  return { EN: value.EN, ZH: value.ZH ?? value.EN };
}

function normalizeBank(raw: typeof bankJson) {
  return {
    ...raw,
    questions: raw.questions.map((q) => {
      const media = (q as { media?: RawMedia }).media;
      return {
        ...q,
        stem: localized(q.stem),
        explanation: localized(q.explanation),
        reference: localized(q.reference),
        options: q.options.map((o) => ({ ...o, label: localized(o.label) })),
        ...(media ? { media: { ...media, alt: localized(media.alt) } } : {}),
      };
    }),
  };
}

/**
 * Loads and validates the bundled question-bank.json once, caching the result.
 * Throws (via Zod) if the file violates the schema or invariants.
 *
 * Retained for tests and as a file fallback only — runtime exam/checkpoint code
 * reads from the DB via `loadQuestionBankFromDB()`.
 */
export function loadQuestionBankFromFile(): QuestionBank {
  if (cached) return cached;
  cached = QuestionBankSchema.parse(normalizeBank(bankJson)) as QuestionBank;
  return cached;
}

/** Compatibility alias for the file loader (tests / fallback). */
export const loadQuestionBank = loadQuestionBankFromFile;

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
 *  bank. */
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
