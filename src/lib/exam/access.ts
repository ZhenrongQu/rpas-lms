import { eligible } from "./generate";
import type { ExamCertLevel, Question } from "../content/types";

export type AccessTier = "GUEST" | "FREE" | "PAID";

/**
 * PAID can create any exam. GUEST (anonymous) and FREE (registered, not yet
 * purchased) can create Basic exams only; Advanced requires PAID.
 */
export function canCreateExam(tier: AccessTier, certLevel: ExamCertLevel): boolean {
  if (tier === "PAID") return true;
  return certLevel === "BASIC";
}

/** Lesson read access: FREE lessons are open to all; PAID lessons need a paid tier. */
export function canViewLesson(tier: AccessTier, access: "FREE" | "PAID"): boolean {
  if (access === "FREE") return true;
  return tier === "PAID";
}

/**
 * Scopes the question pool by access tier for a Basic exam:
 * - PAID  → all eligible questions (every difficulty)
 * - FREE  → Basic, difficulty 1 (a full registered-but-unpaid sample)
 * - GUEST → Basic, difficulty 0 (anonymous taster)
 * Advanced is PAID-only, so FREE/GUEST get an empty Advanced pool.
 */
export function questionsForAccess(
  questions: Question[],
  tier: AccessTier,
  certLevel: ExamCertLevel,
): Question[] {
  const pool = eligible(questions, certLevel);
  if (tier === "PAID") return pool;
  if (certLevel !== "BASIC") return [];
  if (tier === "FREE") return pool.filter((q) => q.difficulty === 1);
  if (tier === "GUEST") return pool.filter((q) => q.difficulty === 0);
  return [];
}
