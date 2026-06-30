/**
 * The structured triage decision. The agent investigates with tools, then emits
 * this shape; parseTriageDecision extracts and validates it from the model's text
 * (robust to a stray ```json fence or surrounding prose).
 */

export type Severity = "P0" | "P1" | "P2" | "P3";

export type TriageDecision = {
  isDuplicate: boolean;
  duplicateOf?: string | null;
  severity: Severity;
  summary: string;
  suspectedFiles: string[];
  suggestedArea: string; // primary path used to route an owner via the roster
  rationale: string;
};

const SEVERITIES: Severity[] = ["P0", "P1", "P2", "P3"];

export function parseTriageDecision(text: string): TriageDecision {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1]!.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object found in triage output");

  const d = JSON.parse(t.slice(start, end + 1)) as TriageDecision;
  if (typeof d.isDuplicate !== "boolean" || !SEVERITIES.includes(d.severity) || !d.summary || !d.suggestedArea) {
    throw new Error("triage decision missing required fields");
  }
  d.suspectedFiles ??= [];
  return d;
}
