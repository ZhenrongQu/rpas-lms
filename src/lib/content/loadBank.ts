import bankJson from "../../../content/question-bank.json";
import { prisma } from "../db";
import { dbQuestionsToQuestionBank } from "./dbMappers";
import { QuestionBankSchema } from "./schema";
import type { QuestionBank } from "./types";

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

/** Loads the ACTIVE question bank from the database (no long-lived cache). */
export async function loadQuestionBankFromDB(): Promise<QuestionBank> {
  const rows = await prisma.question.findMany({
    where: { status: "ACTIVE" },
    include: { options: true },
  });
  return dbQuestionsToQuestionBank(rows);
}
