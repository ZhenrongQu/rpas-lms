import { describe, it, expect } from "vitest";
import { parseTriageDecision } from "./schema";

const valid = {
  isDuplicate: false,
  duplicateOf: null,
  severity: "P1",
  summary: "scoreExam null deref",
  suspectedFiles: ["src/lib/exam/score.ts"],
  suggestedArea: "src/lib/exam",
  rationale: "because the answers array contains undefined",
};

describe("parseTriageDecision", () => {
  it("parses a clean JSON object", () => {
    const d = parseTriageDecision(JSON.stringify(valid));
    expect(d.severity).toBe("P1");
    expect(d.suspectedFiles).toEqual(["src/lib/exam/score.ts"]);
  });

  it("extracts JSON from inside a ```json fence with surrounding prose", () => {
    const d = parseTriageDecision("Here is my decision:\n```json\n" + JSON.stringify(valid) + "\n```\nThanks!");
    expect(d.suggestedArea).toBe("src/lib/exam");
  });

  it("defaults suspectedFiles when absent", () => {
    const { suspectedFiles: _omit, ...noFiles } = valid;
    const d = parseTriageDecision(JSON.stringify(noFiles));
    expect(d.suspectedFiles).toEqual([]);
  });

  it("throws on a missing required field", () => {
    expect(() => parseTriageDecision(JSON.stringify({ severity: "P1" }))).toThrow();
  });

  it("throws on an invalid severity", () => {
    expect(() => parseTriageDecision(JSON.stringify({ ...valid, severity: "P9" }))).toThrow();
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseTriageDecision("I could not analyse this issue.")).toThrow();
  });
});
