import { describe, it, expect } from "vitest";
import { eligible, generateExam } from "./generate";
import { loadQuestionBank } from "../content/loadBank";
import { mulberry32 } from "./rng";

const bank = loadQuestionBank();

describe("eligible", () => {
  it("includes BOTH and the requested level, excludes the other level", () => {
    const basic = eligible(bank.questions, "BASIC");
    expect(basic.every((q) => q.certLevel === "BASIC" || q.certLevel === "BOTH")).toBe(true);
    expect(basic.some((q) => q.certLevel === "ADVANCED")).toBe(false);
  });
});

describe("generateExam", () => {
  it("fills a full 35-question Basic mock with no duplicates", () => {
    const exam = generateExam("BASIC", 35, mulberry32(42), bank);
    expect(exam).toHaveLength(35);
    expect(new Set(exam.map((q) => q.id)).size).toBe(35);
    expect(exam.every((q) => q.certLevel !== "ADVANCED")).toBe(true);
  });

  it("returns min(total, eligiblePool) — never repeats or invents", () => {
    const eligibleCount = eligible(bank.questions, "ADVANCED").length;
    const exam = generateExam("ADVANCED", 50, mulberry32(7), bank);
    expect(exam).toHaveLength(Math.min(50, eligibleCount));
    expect(new Set(exam.map((q) => q.id)).size).toBe(exam.length);
  });

  it("is deterministic for a given seed", () => {
    const a = generateExam("BASIC", 35, mulberry32(99), bank).map((q) => q.id);
    const b = generateExam("BASIC", 35, mulberry32(99), bank).map((q) => q.id);
    expect(a).toEqual(b);
  });

  it("produces different sets for different seeds", () => {
    const a = generateExam("BASIC", 35, mulberry32(1), bank).map((q) => q.id);
    const b = generateExam("BASIC", 35, mulberry32(2), bank).map((q) => q.id);
    expect(a).not.toEqual(b);
  });
});
