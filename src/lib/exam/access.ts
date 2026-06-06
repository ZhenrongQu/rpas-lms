import type { ExamCertLevel, Question } from "../content/types";

export type AccessTier = "GUEST" | "FREE" | "PAID";

export function canCreateExam(tier: AccessTier, certLevel: ExamCertLevel): boolean {
  if (tier === "PAID") return true;
  if (tier === "FREE") return certLevel === "BASIC";
  return false;
}

export function questionsForAccess(
  questions: Question[],
  tier: AccessTier,
  certLevel: ExamCertLevel,
): Question[] {
  if (tier === "PAID") return questions;
  if (tier === "FREE" && certLevel === "BASIC") {
    return questions.filter((q) => q.moduleId === "air-law" || q.moduleId === "human-factors");
  }
  return [];
}
