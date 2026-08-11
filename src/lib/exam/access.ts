// Access policy moved to src/lib/domain/accessPolicy.ts — it governs lessons as
// well as exams, so `src/lib/mobile/*` had to reach into `exam/` for lesson
// permissions. This re-export keeps the existing import path working; new code
// should import from ../domain/accessPolicy directly.
export { canCreateExam, canViewLesson, questionsForAccess } from "../domain/accessPolicy";
export type { AccessTier } from "../domain/accessPolicy";
