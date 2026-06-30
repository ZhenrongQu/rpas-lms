import { runAgent, type AgentResult } from "../runtime";
import { MockIssueTracker } from "../integrations/issueTracker";
import { PRD_PROMPT, RFC_PROMPT, TASKS_PROMPT, TICKETS_PROMPT } from "./prompts";
import {
  CODEGRAPH_TOOL,
  CREATE_TICKET_TOOL,
  codegraphRunTool,
  type CreateTicketInput,
} from "./tools";

/**
 * The SDLC pipeline definition — the *policy/data* half (the engine in
 * pipeline.ts is the reusable mechanism). To build a different pipeline you edit
 * this array and the prompts; the engine doesn't change.
 *
 * Each stage receives the idea + all prior approved artifacts and returns its own
 * draft. `requiresApproval: true` means the engine stops at a durable gate after
 * this stage. RFC/TASKS use the read-only find_in_codebase tool; TICKETS uses the
 * create_ticket ACTION tool, and runs only after the TASKS plan is approved.
 */

export type StageContext = {
  runId: string;
  idea: string;
  artifacts: Record<string, string>; // prior stage outputs, keyed by stage name
};

export type Stage = {
  name: string;
  requiresApproval: boolean;
  run: (ctx: StageContext) => Promise<AgentResult>;
};

export const SDLC_STAGES: Stage[] = [
  {
    name: "PRD",
    requiresApproval: true,
    run: (ctx) => runAgent({ system: PRD_PROMPT }, `Feature idea:\n${ctx.idea}`),
  },
  {
    name: "RFC",
    requiresApproval: true,
    run: (ctx) =>
      runAgent(
        { system: RFC_PROMPT, tools: [CODEGRAPH_TOOL], runTool: codegraphRunTool },
        `Approved PRD:\n\n${ctx.artifacts.PRD ?? "(missing)"}\n\n---\nOriginal idea:\n${ctx.idea}`,
      ),
  },
  {
    name: "TASKS",
    requiresApproval: true,
    run: (ctx) =>
      runAgent(
        { system: TASKS_PROMPT, tools: [CODEGRAPH_TOOL], runTool: codegraphRunTool },
        `PRD:\n\n${ctx.artifacts.PRD ?? "(missing)"}\n\n---\nRFC:\n\n${ctx.artifacts.RFC ?? "(missing)"}\n\n---\nBreak this into concrete engineering tasks.`,
      ),
  },
  {
    name: "TICKETS",
    requiresApproval: false, // runs after the TASKS gate — the action is already approved
    run: async (ctx) => {
      const tracker = new MockIssueTracker();
      const created: string[] = [];
      const result = await runAgent(
        {
          system: TICKETS_PROMPT,
          tools: [CREATE_TICKET_TOOL],
          runTool: async (name, input) => {
            if (name !== "create_ticket") return `unknown tool: ${name}`;
            const { title, body, area } = input as CreateTicketInput;
            const t = await tracker.create({ title, body, area, runId: ctx.runId });
            created.push(`${t.key} → ${t.assignee}  (${t.title})`);
            return `Created ${t.key}, assigned to ${t.assignee} (area: ${t.area}).`;
          },
        },
        `Approved task plan:\n\n${ctx.artifacts.TASKS ?? "(missing)"}\n\nFile one ticket per task with the create_ticket tool.`,
      );
      const summary = created.length
        ? `${result.text}\n\nTickets filed:\n- ${created.join("\n- ")}`
        : `${result.text}\n\n(no tickets were filed)`;
      return { text: summary, tokens: result.tokens };
    },
  },
];
