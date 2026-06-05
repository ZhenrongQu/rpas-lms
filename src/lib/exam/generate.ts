import { loadQuestionBank } from "../content/loadBank";
import { allocateQuotas } from "./quota";
import { SUBJECT_WEIGHTS } from "./config";
import {
  MODULE_IDS,
  type ExamCertLevel,
  type Question,
  type QuestionBank,
} from "../content/types";

/** Questions usable for a given exam level: the level itself plus BOTH. */
export function eligible(questions: Question[], certLevel: ExamCertLevel): Question[] {
  return questions.filter((q) => q.certLevel === certLevel || q.certLevel === "BOTH");
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  bank: QuestionBank = loadQuestionBank(),
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
