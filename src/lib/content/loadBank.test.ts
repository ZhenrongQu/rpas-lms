import { describe, it, expect } from "vitest";
import { loadQuestionBank } from "./loadBank";
import { MODULE_IDS } from "./types";

describe("loadQuestionBank", () => {
  it("loads and validates the real bank, covering all 8 modules", () => {
    const bank = loadQuestionBank();
    expect(bank.schemaVersion).toBe(1);
    expect(bank.questions.length).toBeGreaterThanOrEqual(50);
    const modules = new Set(bank.questions.map((q) => q.moduleId));
    for (const m of MODULE_IDS) {
      expect(modules.has(m)).toBe(true);
    }
  });

  it("returns the same cached instance on repeated calls", () => {
    expect(loadQuestionBank()).toBe(loadQuestionBank());
  });
});
