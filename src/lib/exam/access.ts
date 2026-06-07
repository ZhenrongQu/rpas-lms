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
  const eligible = questions.filter((q) => q.certLevel === certLevel || q.certLevel === "BOTH");
  if (tier === "PAID") return eligible;
  if (tier === "FREE" && certLevel === "BASIC") return eligible.filter((q) => q.difficulty === 0);
  return [];
}
