import { runAgent } from "../runtime";
import { registerPipeline, type Stage } from "../pipeline";
import { TicketFiler } from "./tickets";
import { PRD_PROMPT, RFC_PROMPT, TASKS_PROMPT, TICKETS_PROMPT } from "./prompts";
import { CODEGRAPH_TOOL, CREATE_TICKET_TOOL, codegraphRunTool } from "./tools";

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
      // forRun() wipes any tickets a prior (crashed) attempt of this run filed, so
      // a stage replay can't double-file; filer.file() validates + dedupes each call.
      const filer = await TicketFiler.forRun(ctx.runId);
      const result = await runAgent(
        {
          system: TICKETS_PROMPT,
          tools: [CREATE_TICKET_TOOL],
          runTool: async (name, input) =>
            name === "create_ticket" ? filer.file(input) : `unknown tool: ${name}`,
        },
        `Approved task plan:\n\n${ctx.artifacts.TASKS ?? "(missing)"}\n\nFile one ticket per task with the create_ticket tool.`,
      );
      const summary = filer.filed.length
        ? `${result.text}\n\nTickets filed:\n- ${filer.filed.join("\n- ")}`
        : `${result.text}\n\n(no tickets were filed)`;
      return { text: summary, tokens: result.tokens };
    },
  },
];

registerPipeline("sdlc", SDLC_STAGES);
