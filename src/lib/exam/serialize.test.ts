import { describe, it, expect } from "vitest";
import { toPublicQuestion } from "./serialize";
import type { Question } from "../content/types";

const q: Question = {
  id: "air-law-0001",
  moduleId: "air-law",
  certLevel: "BASIC",
  type: "SINGLE",
  selectCount: 1,
  difficulty: 1,
  stem: { EN: "English stem", ZH: "Chinese stem" },
  options: [
    { id: "a", label: { EN: "Opt A", ZH: "Option A" }, isCorrect: true },
    { id: "b", label: { EN: "Opt B", ZH: "Option B" }, isCorrect: false },
  ],
  explanation: { EN: "expl", ZH: "expl" },
  reference: { EN: "ref", ZH: "ref" },
  tags: ["x"],
};

describe("toPublicQuestion", () => {
  it("returns localized stem and options for the requested locale", () => {
    const pub = toPublicQuestion(q, "ZH");
    expect(pub.stem).toBe("Chinese stem");
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

  it("omits media when absent and passes through localized media when present", () => {
    expect(toPublicQuestion(q, "EN").media).toBeUndefined();

    const withMedia: Question = {
      ...q,
      media: {
        kind: "image",
        url: "https://cdn.example.com/media/air-law/air-law-0001.png",
        alt: { EN: "Airspace diagram", ZH: "空域示意图" },
      },
    };
    const pub = toPublicQuestion(withMedia, "ZH");
    expect(pub.media).toEqual({
      kind: "image",
      url: "https://cdn.example.com/media/air-law/air-law-0001.png",
      alt: "空域示意图",
    });
  });
});
