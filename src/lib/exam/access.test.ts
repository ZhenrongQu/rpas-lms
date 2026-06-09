import { describe, expect, it } from "vitest";
import { canCreateExam, canViewLesson, questionsForAccess } from "./access";
import { loadQuestionBank } from "../content/loadBank";

const bank = loadQuestionBank();

describe("exam access policy", () => {
  it("lets guests and free users create Basic only, and paid users all exams", () => {
    expect(canCreateExam("GUEST", "BASIC")).toBe(true);
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

  it("scopes Basic pools by tier: GUEST=difficulty 0, FREE=difficulty 1, PAID=all", () => {
    const guest = questionsForAccess(bank.questions, "GUEST", "BASIC");
    const free = questionsForAccess(bank.questions, "FREE", "BASIC");
    const paid = questionsForAccess(bank.questions, "PAID", "BASIC");

    expect(guest.length).toBeGreaterThan(0);
    expect(guest.every((q) => q.difficulty === 0)).toBe(true);

    expect(free.length).toBeGreaterThan(0);
    expect(free.every((q) => q.difficulty === 1)).toBe(true);

    expect(paid.length).toBeGreaterThan(free.length);
  });

  it("gives FREE and GUEST no Advanced questions (Advanced is PAID-only)", () => {
    expect(questionsForAccess(bank.questions, "FREE", "ADVANCED")).toHaveLength(0);
    expect(questionsForAccess(bank.questions, "GUEST", "ADVANCED")).toHaveLength(0);
    expect(questionsForAccess(bank.questions, "PAID", "ADVANCED").length).toBeGreaterThan(0);
  });
});
