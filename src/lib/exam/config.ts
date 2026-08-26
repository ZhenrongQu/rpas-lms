import type { ExamCertLevel, ModuleId } from "../content/types";
import type { AccessTier } from "./access";

/**
 * Number of questions in the anonymous Basic taster (PRD U4).
 *
 * Drawn at random from the difficulty-0 pool, which content ops keeps at ~20
 * (see GUEST_POOL_TARGET) — so a guest who retakes the taster sees a different
 * paper each time, while total exposure stays capped at those 20 questions
 * rather than spilling into the full bank.
 */
export const GUEST_BASIC_QUESTION_COUNT = 15;

export function examQuestionCount(tier: AccessTier, certLevel: ExamCertLevel): number {
  if (tier === "GUEST" && certLevel === "BASIC") return GUEST_BASIC_QUESTION_COUNT;
  return EXAM_SPECS[certLevel].totalQuestions;
}

/**
 * How long an anonymous exam session stays reachable (PRD U6). An ownerless
 * session is protected only by its unguessable id, so it should not stay
 * addressable forever; 24 hours is long enough to finish or come back to a
 * taster, and registering within that window claims it permanently.
 */
export const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface ExamSpec {
  totalQuestions: number;
  timeLimitMinutes: number;
  passThreshold: number; // 0..1
}

export const EXAM_SPECS: Record<ExamCertLevel, ExamSpec> = {
  BASIC: { totalQuestions: 35, timeLimitMinutes: 90, passThreshold: 0.65 },
  ADVANCED: { totalQuestions: 50, timeLimitMinutes: 60, passThreshold: 0.8 },
};

// Each map's shares sum to 1.0.
export const SUBJECT_WEIGHTS: Record<ExamCertLevel, Record<ModuleId, number>> = {
  BASIC: {
    "air-law": 0.3,
    "flight-operations": 0.16,
    "human-factors": 0.12,
    meteorology: 0.1,
    navigation: 0.08,
    "airframes-systems": 0.1,
    radiotelephony: 0.08,
    "theory-of-flight": 0.06,
  },
  ADVANCED: {
    "air-law": 0.28,
    "flight-operations": 0.16,
    "human-factors": 0.12,
    meteorology: 0.1,
    navigation: 0.1,
    "airframes-systems": 0.08,
    radiotelephony: 0.1,
    "theory-of-flight": 0.06,
  },
};
