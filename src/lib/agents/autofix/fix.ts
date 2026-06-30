import { runAgent } from "../runtime";
import { FIX_TOOLS, makeFixRunTool } from "./tools";
import { FIX_PROMPT } from "./prompt";
import type { TriageDecision } from "../triage/schema";

/**
 * The fix agent: given a triage decision and an isolated worktree, read the
 * suspected files and write a minimal fix into the worktree. Reuses the same
 * runAgent runtime; the only new thing vs triage is the write-capable tool set
 * (bound to this worktree). The caller captures the resulting `git diff`.
 */
export async function runFix(
  decision: TriageDecision,
  worktreeRoot: string,
): Promise<{ summary: string; tokens: number }> {
  const input = [
    `Bug: ${decision.summary}`,
    `Severity: ${decision.severity}`,
    `Root-cause rationale: ${decision.rationale}`,
    "Suspected files:",
    ...decision.suspectedFiles.map((f) => `- ${f}`),
    "",
    "Read these files and make the minimal fix.",
  ].join("\n");

  const { text, tokens } = await runAgent(
    { system: FIX_PROMPT, tools: FIX_TOOLS, runTool: makeFixRunTool(worktreeRoot), maxSteps: 14 },
    input,
  );
  return { summary: text, tokens };
}
