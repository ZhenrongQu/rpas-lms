import { describe, expect, it } from "vitest";
import { canCreateExam, canViewLesson, questionsForAccess } from "./access";
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

  it("opens FREE lessons to everyone but restricts PAID lessons to paid users", () => {
    expect(canViewLesson("GUEST", "FREE")).toBe(true);
    expect(canViewLesson("FREE", "FREE")).toBe(true);
    expect(canViewLesson("PAID", "FREE")).toBe(true);
    expect(canViewLesson("GUEST", "PAID")).toBe(false);
    expect(canViewLesson("FREE", "PAID")).toBe(false);
    expect(canViewLesson("PAID", "PAID")).toBe(true);
  });

  it("limits free users to difficulty 0 questions", () => {
    const free = questionsForAccess(bank.questions, "FREE", "BASIC");
    const paid = questionsForAccess(bank.questions, "PAID", "BASIC");

    expect(free.length).toBeGreaterThan(0);
    expect(free.length).toBeLessThan(paid.length);
    expect(free.every((q) => q.difficulty === 0)).toBe(true);
  });
});
