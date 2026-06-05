import { describe, it, expect } from "vitest";
import { QuestionSchema, QuestionBankSchema } from "./schema";

const validSingle = {
  id: "air-law-0001",
  moduleId: "air-law",
  certLevel: "BOTH",
  type: "SINGLE",
  selectCount: 1,
  difficulty: 1,
  stem: { EN: "Q?", FR: "Q?" },
  options: [
    { id: "a", label: { EN: "A", FR: "A" }, isCorrect: true },
    { id: "b", label: { EN: "B", FR: "B" }, isCorrect: false },
  ],
  explanation: { EN: "e", FR: "e" },
  reference: { EN: "r", FR: "r" },
  tags: ["x"],
};

describe("QuestionSchema", () => {
  it("accepts a valid SINGLE question", () => {
    expect(QuestionSchema.safeParse(validSingle).success).toBe(true);
  });

  it("rejects SINGLE with two correct options", () => {
    const bad = {
      ...validSingle,
      options: [
        { id: "a", label: { EN: "A", FR: "A" }, isCorrect: true },
        { id: "b", label: { EN: "B", FR: "B" }, isCorrect: true },
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
        { id: "a", label: { EN: "A", FR: "A" }, isCorrect: true },
        { id: "b", label: { EN: "B", FR: "B" }, isCorrect: true },
        { id: "c", label: { EN: "C", FR: "C" }, isCorrect: false },
      ],
    };
    expect(QuestionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing FR locale", () => {
    const bad = { ...validSingle, stem: { EN: "only en", FR: "" } };
    expect(QuestionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate option ids", () => {
    const bad = {
      ...validSingle,
      options: [
        { id: "a", label: { EN: "A", FR: "A" }, isCorrect: true },
        { id: "a", label: { EN: "B", FR: "B" }, isCorrect: false },
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
