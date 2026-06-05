import { describe, it, expect } from "vitest";
import { correctOptionIds, isAnswerCorrect } from "./grade";
import type { Question } from "../content/types";

const single: Question = {
  id: "air-law-0001",
  moduleId: "air-law",
  certLevel: "BOTH",
  type: "SINGLE",
  selectCount: 1,
  difficulty: 1,
  stem: { EN: "?", FR: "?" },
  options: [
    { id: "a", label: { EN: "A", FR: "A" }, isCorrect: false },
    { id: "b", label: { EN: "B", FR: "B" }, isCorrect: true },
  ],
  explanation: { EN: "", FR: "" } as never, // not used by grader
  reference: { EN: "", FR: "" } as never,
  tags: [],
};

const multi: Question = {
  ...single,
  id: "air-law-0011",
  type: "MULTI",
  selectCount: 2,
  options: [
    { id: "a", label: { EN: "A", FR: "A" }, isCorrect: true },
    { id: "b", label: { EN: "B", FR: "B" }, isCorrect: true },
    { id: "c", label: { EN: "C", FR: "C" }, isCorrect: false },
  ],
};

describe("correctOptionIds", () => {
  it("returns the sorted correct ids", () => {
    expect(correctOptionIds(multi)).toEqual(["a", "b"]);
  });
});

describe("isAnswerCorrect", () => {
  it("grades a correct SINGLE answer", () => {
    expect(isAnswerCorrect(single, ["b"])).toBe(true);
  });
  it("grades a wrong SINGLE answer", () => {
    expect(isAnswerCorrect(single, ["a"])).toBe(false);
  });
  it("treats no selection as incorrect", () => {
    expect(isAnswerCorrect(single, [])).toBe(false);
  });
  it("requires an exact set match for MULTI", () => {
    expect(isAnswerCorrect(multi, ["a", "b"])).toBe(true);
    expect(isAnswerCorrect(multi, ["b", "a"])).toBe(true); // order-independent
  });
  it("rejects a partial MULTI selection", () => {
    expect(isAnswerCorrect(multi, ["a"])).toBe(false);
  });
  it("rejects a MULTI selection containing a wrong option", () => {
    expect(isAnswerCorrect(multi, ["a", "b", "c"])).toBe(false);
  });
  it("ignores duplicate selections", () => {
    expect(isAnswerCorrect(multi, ["a", "a", "b"])).toBe(true);
  });
});
