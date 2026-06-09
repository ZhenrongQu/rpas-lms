import type { ExamCertLevel, ModuleId } from "../content/types";
import type { AccessTier } from "./access";

/** Number of questions in a mock for a given access tier. */
export const GUEST_BASIC_QUESTION_COUNT = 10;

export function examQuestionCount(tier: AccessTier, certLevel: ExamCertLevel): number {
  if (tier === "GUEST" && certLevel === "BASIC") return GUEST_BASIC_QUESTION_COUNT;
  return EXAM_SPECS[certLevel].totalQuestions;
}

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
