import { describe, expect, it } from "vitest";
import { computeBankHealth, GUEST_POOL_TARGET } from "./bankHealth";
import { makeTestBank } from "../content/__fixtures__/bank";
import { examQuestionCount } from "../exam/config";
import type { QuestionBank } from "../content/types";

const bank = makeTestBank();
const row = (rows: ReturnType<typeof computeBankHealth>, tier: string) =>
  rows.find((r) => r.tier === tier)!;

describe("question bank health (PRD U1 / U4)", () => {
  it("reports each tier's drawable pool for the Basic bank", () => {
    const rows = computeBankHealth(bank, "BASIC");
    expect(rows.map((r) => r.tier)).toEqual(["GUEST", "FREE", "PAID"]);
    // Fixture bank: 8 modules × (3 difficulty-0 + 6 difficulty-1).
    expect(row(rows, "GUEST").available).toBe(24);
    expect(row(rows, "FREE").available).toBe(48);
    expect(row(rows, "PAID").available).toBe(72);
    expect(rows.every((r) => r.ok)).toBe(true);
  });

  it("uses the same required counts exam creation uses", () => {
    const rows = computeBankHealth(bank, "BASIC");
    expect(row(rows, "GUEST").required).toBe(examQuestionCount("GUEST", "BASIC"));
    expect(row(rows, "FREE").required).toBe(examQuestionCount("FREE", "BASIC"));
  });

  it("holds the guest pool to a redundancy target above the hard floor", () => {
    const thin: QuestionBank = {
      schemaVersion: 1,
      questions: bank.questions.filter((q) => q.certLevel === "BASIC" && q.difficulty === 0).slice(0, 16),
    };
    const guest = row(computeBankHealth(thin, "BASIC"), "GUEST");
    expect(guest.available).toBe(16);
    expect(guest.target).toBe(GUEST_POOL_TARGET);
    expect(guest.ok).toBe(true); // 16 >= 15: a taster can still be generated
    expect(guest.meetsTarget).toBe(false); // but ops should top the pool back up
  });

  it("flags a pool that can no longer fill a paper", () => {
    const thin: QuestionBank = {
      schemaVersion: 1,
      questions: bank.questions.filter((q) => q.certLevel === "BASIC" && q.difficulty === 1).slice(0, 5),
    };
    const rows = computeBankHealth(thin, "BASIC");
    expect(row(rows, "FREE").ok).toBe(false);
    expect(row(rows, "GUEST").ok).toBe(false); // no difficulty-0 questions at all
  });

  it("audits only the PAID tier for Advanced, which is PAID-only by policy", () => {
    const rows = computeBankHealth(bank, "ADVANCED");
    expect(rows.map((r) => r.tier)).toEqual(["PAID"]);
    expect(row(rows, "PAID").required).toBe(50);
    expect(row(rows, "PAID").ok).toBe(true);
  });
});
