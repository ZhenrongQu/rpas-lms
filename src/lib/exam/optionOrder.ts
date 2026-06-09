import { mulberry32 } from "./rng";
import { shuffle } from "./shuffle";

/** FNV-1a 32-bit string hash → unsigned 32-bit seed for mulberry32. */
function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministically orders a question's options for a given exam session.
 *
 * The order is derived from `sessionId` + `questionId`, so it is stable across
 * re-fetches and identical between the exam view and the post-submit review,
 * yet differs between sessions. Grading is unaffected because it compares option
 * ids (see grade.ts), never display order or letters.
 */
export function orderedOptions<T extends { id: string }>(
  options: T[],
  sessionId: string,
  questionId: string,
): T[] {
  const rng = mulberry32(hashSeed(`${sessionId}:${questionId}`));
  return shuffle(options, rng);
}
