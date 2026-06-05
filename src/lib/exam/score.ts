import type { ModuleId, Question } from "../content/types";
import { isAnswerCorrect } from "./grade";

export interface SubjectScore {
  moduleId: ModuleId;
  correct: number;
  total: number;
}

export interface ExamResult {
  total: number;
  correct: number;
  scorePct: number; // 0..1
  passed: boolean;
  bySubject: SubjectScore[];
}

/**
 * Grades every question against the submitted answers (missing answer =
 * incorrect) and returns overall score plus a per-subject breakdown.
 */
export function scoreExam(
  questions: Question[],
  answers: Record<string, string[]>,
  passThreshold: number,
): ExamResult {
  const bySubject = new Map<ModuleId, SubjectScore>();
  let correct = 0;

  for (const q of questions) {
    const ok = isAnswerCorrect(q, answers[q.id] ?? []);
    if (ok) correct++;
    const s = bySubject.get(q.moduleId) ?? { moduleId: q.moduleId, correct: 0, total: 0 };
    s.total += 1;
    if (ok) s.correct += 1;
    bySubject.set(q.moduleId, s);
  }

  const total = questions.length;
  const scorePct = total === 0 ? 0 : correct / total;
  return {
    total,
    correct,
    scorePct,
    passed: scorePct >= passThreshold,
    bySubject: [...bySubject.values()],
  };
}
