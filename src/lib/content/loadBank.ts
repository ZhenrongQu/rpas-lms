import bankJson from "../../../content/question-bank.json";
import { QuestionBankSchema } from "./schema";
import type { QuestionBank } from "./types";

let cached: QuestionBank | null = null;

/**
 * Loads and validates the question bank once, caching the result.
 * Throws (via Zod) if the bank file violates the schema or invariants.
 */
export function loadQuestionBank(): QuestionBank {
  if (cached) return cached;
  cached = QuestionBankSchema.parse(bankJson) as QuestionBank;
  return cached;
}
