import { loadQuestionBankFromDB } from "../content/loadBank";
import { examQuestionCount } from "../exam/config";
import { eligible } from "../exam/generate";
import { questionsForAccess, type AccessTier } from "../exam/access";
import type { ExamCertLevel, QuestionBank } from "../content/types";

/**
 * Operational redundancy target for the guest taster pool (PRD U4): keep ~20
 * ACTIVE difficulty-0 Basic questions so each 15-question taster can vary. The
 * hard floor is the taster size itself — below that, creation refuses (DEF-003).
 */
export const GUEST_POOL_TARGET = 20;

export type BankHealthRow = {
  certLevel: ExamCertLevel;
  tier: AccessTier;
  /** ACTIVE questions this tier can actually draw from. */
  available: number;
  /** Hard floor: below this `createMock` throws InsufficientQuestionPoolError. */
  required: number;
  /** Operational target — content ops should stay above this, not just above `required`. */
  target: number;
  ok: boolean;
  meetsTarget: boolean;
};

/**
 * Tier/level combinations worth auditing. ADVANCED is PAID-only by policy, so a
 * GUEST/FREE advanced pool is empty *by design* — reporting it as unhealthy would
 * train admins to ignore the table.
 */
const AUDITED: ReadonlyArray<readonly [ExamCertLevel, AccessTier]> = [
  ["BASIC", "GUEST"],
  ["BASIC", "FREE"],
  ["BASIC", "PAID"],
  ["ADVANCED", "PAID"],
] as const;

/**
 * Health of one loaded bank. Derives `available` through `questionsForAccess` and
 * `required` through `examQuestionCount` — the very functions `createMock` uses —
 * so the CMS can never disagree with what exam creation will actually do.
 */
export function computeBankHealth(bank: QuestionBank, certLevel: ExamCertLevel): BankHealthRow[] {
  return AUDITED.filter(([level]) => level === certLevel).map(([level, tier]) => {
    const available = eligible(questionsForAccess(bank.questions, tier, level), level).length;
    const required = examQuestionCount(tier, level);
    const target = tier === "GUEST" ? GUEST_POOL_TARGET : required;
    return {
      certLevel: level,
      tier,
      available,
      required,
      target,
      ok: available >= required,
      meetsTarget: available >= target,
    };
  });
}

/** Bank health across both levels, read from the live ACTIVE banks. Admin-only. */
export async function bankHealth(): Promise<BankHealthRow[]> {
  const [basic, advanced] = await Promise.all([
    loadQuestionBankFromDB("BASIC"),
    loadQuestionBankFromDB("ADVANCED"),
  ]);
  return [...computeBankHealth(basic, "BASIC"), ...computeBankHealth(advanced, "ADVANCED")];
}
