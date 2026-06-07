import { describe, it, expect } from "vitest";
import { QuestionSchema, QuestionBankSchema } from "./schema";

const validSingle = {
  id: "air-law-0001",
  moduleId: "air-law",
  certLevel: "BOTH",
  type: "SINGLE",
  selectCount: 1,
  difficulty: 1,
  stem: { EN: "Q?", ZH: "Q?" },
  options: [
    { id: "a", label: { EN: "A", ZH: "A" }, isCorrect: true },
    { id: "b", label: { EN: "B", ZH: "B" }, isCorrect: false },
  ],
  explanation: { EN: "e", ZH: "e" },
  reference: { EN: "r", ZH: "r" },
  tags: ["x"],
};

describe("QuestionSchema", () => {
  it("accepts a valid SINGLE question", () => {
    expect(QuestionSchema.safeParse(validSingle).success).toBe(true);
  });

  it("accepts difficulty 0 for free questions", () => {
    const freeQuestion = { ...validSingle, difficulty: 0 };
    expect(QuestionSchema.safeParse(freeQuestion).success).toBe(true);
  });

  it("rejects SINGLE with two correct options", () => {
    const bad = {
      ...validSingle,
      options: [
        { id: "a", label: { EN: "A", ZH: "A" }, isCorrect: true },
        { id: "b", label: { EN: "B", ZH: "B" }, isCorrect: true },
      ],
    };
    expect(QuestionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects MULTI whose correct count != selectCount", () => {
    const bad = {
      ...validSingle,
      type: "MULTI",
      selectCount: 3,
      options: [
        { id: "a", label: { EN: "A", ZH: "A" }, isCorrect: true },
        { id: "b", label: { EN: "B", ZH: "B" }, isCorrect: true },
        { id: "c", label: { EN: "C", ZH: "C" }, isCorrect: false },
      ],
    };
    expect(QuestionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing ZH locale", () => {
    const bad = { ...validSingle, stem: { EN: "only en", ZH: "" } };
    expect(QuestionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate option ids", () => {
    const bad = {
      ...validSingle,
      options: [
        { id: "a", label: { EN: "A", ZH: "A" }, isCorrect: true },
        { id: "a", label: { EN: "B", ZH: "B" }, isCorrect: false },
      ],
    };
    expect(QuestionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("QuestionBankSchema", () => {
  it("rejects duplicate question ids", () => {
    const bank = { schemaVersion: 1, questions: [validSingle, validSingle] };
    expect(QuestionBankSchema.safeParse(bank).success).toBe(false);
  });
});
