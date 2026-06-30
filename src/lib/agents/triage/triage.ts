import { runAgent } from "../runtime";
import { CODEGRAPH_TOOL, codegraphRunTool } from "../sdlc/tools";
import { TRIAGE_PROMPT } from "./prompt";
import { parseTriageDecision, type TriageDecision } from "./schema";
import type { SentryIssue } from "./sentry";

/**
 * The triage agent: given a Sentry issue + the open tickets, investigate via the
 * codegraph tool and return a structured decision. Reuses the same runAgent
 * runtime and find_in_codebase tool as the SDLC pipeline — only the prompt and
 * the output shape differ.
 */

export type OpenTicket = { key: string; title: string; area: string };

export async function runTriage(
  issue: SentryIssue,
  openTickets: OpenTicket[],
): Promise<{ decision: TriageDecision; tokens: number }> {
  const ticketList = openTickets.length
    ? openTickets.map((t) => `- ${t.key}: ${t.title} [${t.area}]`).join("\n")
    : "(none)";

  const input = [
    `Sentry issue ${issue.id}:`,
    `title: ${issue.title}`,
    `type: ${issue.metadata.type} — ${issue.metadata.value}`,
    `culprit: ${issue.culprit}`,
    `count: ${issue.count}, affected users: ${issue.userCount}`,
    `first seen: ${issue.firstSeen}, last seen: ${issue.lastSeen}`,
    "",
    "stack trace:",
    issue.stacktrace,
    "",
    "Currently open tickets:",
    ticketList,
  ].join("\n");

  const { text, tokens } = await runAgent(
    { system: TRIAGE_PROMPT, tools: [CODEGRAPH_TOOL], runTool: codegraphRunTool, maxSteps: 12 },
    input,
  );
  return { decision: parseTriageDecision(text), tokens };
}
