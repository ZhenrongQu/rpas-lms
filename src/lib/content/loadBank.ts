import bankJson from "../../../content/question-bank.json";
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
 * Loads and validates the question bank once, caching the result.
 * Throws (via Zod) if the bank file violates the schema or invariants.
 */
export function loadQuestionBank(): QuestionBank {
  if (cached) return cached;
  cached = QuestionBankSchema.parse(normalizeBank(bankJson)) as QuestionBank;
  return cached;
}
