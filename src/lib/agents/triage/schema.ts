import { z } from "zod";

/**
 * The structured triage decision. The agent investigates with tools, then emits
 * this shape; parseTriageDecision extracts the JSON from the model's text (robust
 * to a stray ```json fence or surrounding prose) and validates every field with
 * zod — a malformed/hallucinated shape throws rather than slipping through.
 */

export const TriageDecisionSchema = z.object({
  isDuplicate: z.boolean(),
  duplicateOf: z.string().nullable().optional(),
  severity: z.enum(["P0", "P1", "P2", "P3"]),
  summary: z.string().min(1),
  suspectedFiles: z.array(z.string()).default([]),
  suggestedArea: z.string().min(1),
  rationale: z.string().default(""),
});

export type TriageDecision = z.infer<typeof TriageDecisionSchema>;
export type Severity = TriageDecision["severity"];

export function parseTriageDecision(text: string): TriageDecision {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1]!.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object found in triage output");

  const raw = JSON.parse(t.slice(start, end + 1));
  return TriageDecisionSchema.parse(raw);
}
