import { describe, it, expect } from "vitest";
import { scoreExam } from "./score";
import type { Question } from "../content/types";

function q(id: string, moduleId: Question["moduleId"], correctId: string): Question {
  return {
    id,
    moduleId,
    certLevel: "BOTH",
    type: "SINGLE",
    selectCount: 1,
    difficulty: 1,
    stem: { EN: "?", FR: "?" },
    options: [
      { id: "a", label: { EN: "A", FR: "A" }, isCorrect: correctId === "a" },
      { id: "b", label: { EN: "B", FR: "B" }, isCorrect: correctId === "b" },
    ],
    explanation: { EN: "x", FR: "x" },
    reference: { EN: "x", FR: "x" },
    tags: [],
  };
}

const questions = [
  q("air-law-0001", "air-law", "a"),
  q("air-law-0002", "air-law", "a"),
  q("navigation-0001", "navigation", "b"),
];

describe("scoreExam", () => {
  it("computes overall score, pass flag and per-subject breakdown", () => {
    const answers = {
      "air-law-0001": ["a"], // correct
      "air-law-0002": ["b"], // wrong
      "navigation-0001": ["b"], // correct
    };
    const result = scoreExam(questions, answers, 0.65);
    expect(result.total).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.scorePct).toBeCloseTo(2 / 3, 5);
    expect(result.passed).toBe(true); // 0.666 >= 0.65

    const airLaw = result.bySubject.find((s) => s.moduleId === "air-law");
    expect(airLaw).toEqual({ moduleId: "air-law", correct: 1, total: 2 });
    const nav = result.bySubject.find((s) => s.moduleId === "navigation");
    expect(nav).toEqual({ moduleId: "navigation", correct: 1, total: 1 });
  });

  it("treats a missing answer as incorrect and can fail the threshold", () => {
    const result = scoreExam(questions, { "air-law-0001": ["a"] }, 0.65);
    expect(result.correct).toBe(1);
    expect(result.passed).toBe(false); // 0.333 < 0.65
  });
});
