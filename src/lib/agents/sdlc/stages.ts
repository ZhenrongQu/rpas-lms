import { runAgent } from "../runtime";
import { registerPipeline, type Stage } from "../pipeline";
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
 * this array and the prompts and call registerPipeline; the engine doesn't change.
 *
 * RFC/TASKS use the read-only find_in_codebase tool; TICKETS uses the create_ticket
 * ACTION tool and runs only after the TASKS plan is approved.
 */

export const SDLC_STAGES: Stage[] = [
  {
    name: "PRD",
    requiresApproval: true,
    run: (ctx) => runAgent({ system: PRD_PROMPT }, `Feature idea:\n${ctx.input}`),
  },
  {
    name: "RFC",
    requiresApproval: true,
    run: (ctx) =>
      runAgent(
        { system: RFC_PROMPT, tools: [CODEGRAPH_TOOL], runTool: codegraphRunTool },
        `Approved PRD:\n\n${ctx.artifacts.PRD ?? "(missing)"}\n\n---\nOriginal idea:\n${ctx.input}`,
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

registerPipeline("sdlc", SDLC_STAGES);
