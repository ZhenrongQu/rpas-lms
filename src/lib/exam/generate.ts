import { allocateQuotas } from "./quota";
import { SUBJECT_WEIGHTS } from "./config";
import { shuffle } from "./shuffle";
import {
  MODULE_IDS,
  type ExamCertLevel,
  type Question,
  type QuestionBank,
} from "../content/types";

/** Questions usable for a given exam level. Each question belongs to exactly one
 *  level (basic or advanced bank) — there is no cross-level pool. */
export function eligible(questions: Question[], certLevel: ExamCertLevel): Question[] {
  return questions.filter((q) => q.certLevel === certLevel);
}

/**
 * Generates a weighted exam: draws per-subject quotas, then backfills any
 * shortfall from the remaining eligible pool. Never repeats or invents a
 * question, so the result length is min(total, eligiblePoolSize).
 */
export function generateExam(
  certLevel: ExamCertLevel,
  total: number,
  rng: () => number,
  bank: QuestionBank,
): Question[] {
  const pool = eligible(bank.questions, certLevel);
  const quotas = allocateQuotas(total, SUBJECT_WEIGHTS[certLevel]);

  const picked: Question[] = [];
  const usedIds = new Set<string>();

  for (const mod of MODULE_IDS) {
    const subjectPool = shuffle(
      pool.filter((q) => q.moduleId === mod),
      rng,
    );
    for (const q of subjectPool.slice(0, quotas[mod])) {
      picked.push(q);
      usedIds.add(q.id);
    }
  }

  if (picked.length < total) {
    const leftovers = shuffle(
      pool.filter((q) => !usedIds.has(q.id)),
      rng,
    );
    for (const q of leftovers) {
      if (picked.length >= total) break;
      picked.push(q);
      usedIds.add(q.id);
    }
  }

  return shuffle(picked, rng);
}
