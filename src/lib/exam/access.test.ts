import { describe, expect, it } from "vitest";
import { canCreateExam, questionsForAccess } from "./access";
import { loadQuestionBank } from "../content/loadBank";

const bank = loadQuestionBank();

describe("exam access policy", () => {
  it("allows guests no exam, free users Basic only, and paid users all exams", () => {
    expect(canCreateExam("GUEST", "BASIC")).toBe(false);
    expect(canCreateExam("GUEST", "ADVANCED")).toBe(false);
    expect(canCreateExam("FREE", "BASIC")).toBe(true);
    expect(canCreateExam("FREE", "ADVANCED")).toBe(false);
    expect(canCreateExam("PAID", "BASIC")).toBe(true);
    expect(canCreateExam("PAID", "ADVANCED")).toBe(true);
  });

  it("limits free Basic exams to a selected subset of the question bank", () => {
    const free = questionsForAccess(bank.questions, "FREE", "BASIC");
    const paid = questionsForAccess(bank.questions, "PAID", "BASIC");

    expect(free.length).toBeGreaterThan(0);
    expect(free.length).toBeLessThan(paid.length);
    expect(free.every((q) => q.moduleId === "air-law" || q.moduleId === "human-factors")).toBe(true);
  });
});
