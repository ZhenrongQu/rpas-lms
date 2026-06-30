import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * The SDLC stages' tools. Two kinds, deliberately contrasted:
 *  - find_in_codebase = a READ tool (safe, no gate) — grounds "affected modules"
 *    in the real code via the codegraph CLI instead of letting the model guess.
 *  - create_ticket    = an ACTION/WRITE tool (touches the outside world) — only
 *    reached in the TICKETS stage, which runs AFTER the human approved the plan.
 *
 * Giving a stage these tools is what makes runAgent's think→act→feed-back loop
 * actually engage (the PRD/RFC drafting stages call no tools, so they're single
 * shots; TASKS/RFC with find_in_codebase and TICKETS with create_ticket are real
 * tool-using agents).
 */

const execFileAsync = promisify(execFile);
const MAX_TOOL_OUTPUT = 5000; // cap codegraph output to keep token cost bounded

export const CODEGRAPH_TOOL: Anthropic.Tool = {
  name: "find_in_codebase",
  description:
    "Search the rpas-lms codebase for symbols and files relevant to a query, with their blast radius " +
    "(who calls them, test coverage). Use this to ground 'affected components/modules' and task paths " +
    "in the REAL code instead of guessing. Pass a short natural-language query or symbol names.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "what to look for, e.g. 'exam session persistence' or 'ExamSession'",
      },
    },
    required: ["query"],
  },
};

/** Runs `codegraph explore "<query>"` in the repo and returns (truncated) output. */
export async function runCodegraph(query: string): Promise<string> {
  if (!query.trim()) return "(empty query)";
  try {
    const { stdout } = await execFileAsync("codegraph", ["explore", query], {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
    });
    if (!stdout.trim()) return "(no results)";
    return stdout.length > MAX_TOOL_OUTPUT ? `${stdout.slice(0, MAX_TOOL_OUTPUT)}\n…(truncated)` : stdout;
  } catch (e) {
    // Degrade gracefully — the model can still draft without the lookup.
    return `codegraph lookup failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** runTool for stages that only have the read tool (RFC, TASKS). */
export async function codegraphRunTool(name: string, input: unknown): Promise<string> {
  if (name === "find_in_codebase") return runCodegraph((input as { query?: string }).query ?? "");
  return `unknown tool: ${name}`;
}

export const CREATE_TICKET_TOOL: Anthropic.Tool = {
  name: "create_ticket",
  description:
    "Create exactly one work ticket for a task and auto-assign it to the owning engineer based on the " +
    "affected area/path. Call once per task in the approved plan.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "short imperative title" },
      body: { type: "string", description: "what to do + any acceptance notes" },
      area: {
        type: "string",
        description: "primary affected path/area, e.g. 'src/lib/exam' — used to route the assignee",
      },
    },
    required: ["title", "body", "area"],
  },
};

export type CreateTicketInput = { title: string; body: string; area: string };
