import type { Question } from "../content/types";

/** Sorted list of the correct option ids for a question. */
export function correctOptionIds(q: Question): string[] {
  return q.options
    .filter((o) => o.isCorrect)
    .map((o) => o.id)
    .sort();
}

/**
 * True iff the selected option ids exactly match the correct set.
 * Works for SINGLE (one correct) and MULTI (exact-set, no partial credit).
 * Duplicate selections are ignored.
 */
export function isAnswerCorrect(q: Question, selected: string[]): boolean {
  const sel = [...new Set(selected)].sort();
  const correct = correctOptionIds(q);
  if (sel.length !== correct.length) return false;
  return sel.every((id, i) => id === correct[i]);
}
