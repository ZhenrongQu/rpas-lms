import { describe, it, expect } from "vitest";
import { toPublicQuestion } from "./serialize";
import type { Question } from "../content/types";

const q: Question = {
  id: "air-law-0001",
  moduleId: "air-law",
  certLevel: "BOTH",
  type: "SINGLE",
  selectCount: 1,
  difficulty: 1,
  stem: { EN: "English stem", FR: "Énoncé français" },
  options: [
    { id: "a", label: { EN: "Opt A", FR: "Option A" }, isCorrect: true },
    { id: "b", label: { EN: "Opt B", FR: "Option B" }, isCorrect: false },
  ],
  explanation: { EN: "expl", FR: "expl" },
  reference: { EN: "ref", FR: "ref" },
  tags: ["x"],
};

describe("toPublicQuestion", () => {
  it("returns localized stem and options for the requested locale", () => {
    const pub = toPublicQuestion(q, "FR");
    expect(pub.stem).toBe("Énoncé français");
    expect(pub.options[0].label).toBe("Option A");
    expect(pub.selectCount).toBe(1);
  });

  it("never includes isCorrect, explanation or reference", () => {
    const pub = toPublicQuestion(q, "EN");
    const serialized = JSON.stringify(pub);
    expect(serialized).not.toContain("isCorrect");
    expect(serialized).not.toContain("expl");
    expect(serialized).not.toContain("ref");
  });
});
