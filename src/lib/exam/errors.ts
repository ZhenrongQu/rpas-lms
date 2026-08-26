import type { ExamCertLevel } from "../content/types";

/**
 * Thrown by ExamService.createMock when the caller's scoped question pool holds
 * fewer questions than a full paper needs (DEF-003 / PRD U1).
 *
 * Before this existed, generateExam silently returned a short paper and the
 * pass threshold was computed against the questions it managed to find — a
 * learner could "pass" a 12-question Basic exam and read that as readiness for
 * the real 35-question one. Refusing to create is the honest failure.
 *
 * `available` / `required` are for server logs and the CMS bank-health view.
 * They must never reach an end user: the counts describe the shape of the bank.
 */
export class InsufficientQuestionPoolError extends Error {
  constructor(
    readonly certLevel: ExamCertLevel,
    readonly available: number,
    readonly required: number,
  ) {
    super(`${certLevel} pool has ${available} eligible questions, needs ${required}`);
    this.name = "InsufficientQuestionPoolError";
  }
}
