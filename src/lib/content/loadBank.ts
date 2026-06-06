import bankJson from "../../../content/question-bank.json";
import { QuestionBankSchema } from "./schema";
import type { QuestionBank } from "./types";

let cached: QuestionBank | null = null;

type RawLocalized = { EN: string; ZH?: string };

function localized(value: RawLocalized) {
  return { EN: value.EN, ZH: value.ZH ?? value.EN };
}

function normalizeBank(raw: typeof bankJson) {
  return {
    ...raw,
    questions: raw.questions.map((q) => ({
      ...q,
      stem: localized(q.stem),
      explanation: localized(q.explanation),
      reference: localized(q.reference),
      options: q.options.map((o) => ({ ...o, label: localized(o.label) })),
    })),
  };
}

/**
 * Loads and validates the question bank once, caching the result.
 * Throws (via Zod) if the bank file violates the schema or invariants.
 */
export function loadQuestionBank(): QuestionBank {
  if (cached) return cached;
  cached = QuestionBankSchema.parse(normalizeBank(bankJson)) as QuestionBank;
  return cached;
}
