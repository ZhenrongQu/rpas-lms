import { describe, it, expect } from "vitest";
import { buildReview } from "./review";
import type { Question } from "../content/types";

const q: Question = {
  id: "air-law-0001",
  moduleId: "air-law",
  certLevel: "BASIC",
  type: "SINGLE",
  selectCount: 1,
  difficulty: 1,
  stem: { EN: "EN stem", ZH: "ZH stem" },
  options: [
    { id: "a", label: { EN: "EN A", ZH: "ZH A" }, isCorrect: false },
    { id: "b", label: { EN: "EN B", ZH: "ZH B" }, isCorrect: true },
  ],
  explanation: { EN: "EN expl", ZH: "ZH expl" },
  reference: { EN: "CAR 901", ZH: "RAC 901" },
  tags: [],
};

describe("buildReview", () => {
  it("projects a question with the user's selection and correctness (EN)", () => {
    const [item] = buildReview([q], { "air-law-0001": ["a"] }, "EN");
    expect(item.stem).toBe("EN stem");
    expect(item.options).toEqual([
      { id: "a", label: "EN A", isCorrect: false },
      { id: "b", label: "EN B", isCorrect: true },
    ]);
    expect(item.selectedOptionIds).toEqual(["a"]);
    expect(item.correctOptionIds).toEqual(["b"]);
    expect(item.isCorrect).toBe(false);
    expect(item.explanation).toBe("EN expl");
    expect(item.reference).toBe("CAR 901");
  });

  it("marks a correct answer and projects ZH strings", () => {
    const [item] = buildReview([q], { "air-law-0001": ["b"] }, "ZH");
    expect(item.isCorrect).toBe(true);
    expect(item.stem).toBe("ZH stem");
    expect(item.reference).toBe("RAC 901");
  });

  it("treats a missing answer as not-correct with empty selection", () => {
    const [item] = buildReview([q], {}, "EN");
    expect(item.selectedOptionIds).toEqual([]);
    expect(item.isCorrect).toBe(false);
  });
});
