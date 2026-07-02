import type Anthropic from "@anthropic-ai/sdk";
import { runAgent, type AgentConfig, type AgentStepInfo, type MessageCreator } from "../../runtime";
import type { RepairContext, Repairer } from "../repair";
import { REPAIR_SYSTEM_PROMPT, REPAIR_TASK, REPAIR_TOOLS } from "./prompt";

// Haiku is a deliberately modest author: cheap to iterate, and MORE likely to err
// or over-reach — which is exactly what stress-tests the deterministic verify +
// capability sandbox. eval can override the model.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_STEPS = 12;
const DEFAULT_MAX_TOKENS = 4096;

export type LlmRepairerOptions = {
  model?: string;
  maxSteps?: number;
  maxTokens?: number;
  thinking?: Anthropic.ThinkingConfigParam;
  /** Test seam: inject a scripted model so unit tests run hermetically. */
  createMessage?: MessageCreator;
  onStep?: (step: AgentStepInfo) => void;
};

/**
 * Model-driven repair author behind the same `Repairer` seam as FixtureRepairer.
 * It can only act through the capability `ctx` (allowlisted reads, policy-gated
 * writes, pinned check) — it literally cannot escape the sandbox — and the
 * deterministic kernel (green-after + hidden holdout + verify gates) remains the
 * sole authority on whether its work is accepted.
 */
export class LlmRepairer implements Repairer {
  /** The step-by-step trace of the last repair() (reasoning text + tool calls + tokens). */
  readonly steps: AgentStepInfo[] = [];

  constructor(private readonly opts: LlmRepairerOptions = {}) {}

  async repair(ctx: RepairContext): Promise<void> {
    this.steps.length = 0;
    const config: AgentConfig = {
      system: REPAIR_SYSTEM_PROMPT,
      tools: REPAIR_TOOLS,
      runTool: (name, input) => this.runTool(ctx, name, input),
      model: this.opts.model ?? DEFAULT_MODEL,
      maxSteps: this.opts.maxSteps ?? DEFAULT_MAX_STEPS,
      maxTokens: this.opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      thinking: this.opts.thinking,
      signal: ctx.signal,
      createMessage: this.opts.createMessage,
      onStep: (s) => {
        this.steps.push(s);
        this.opts.onStep?.(s);
      },
    };

    try {
      await runAgent(config, REPAIR_TASK);
    } catch (e) {
      if (ctx.signal.aborted) throw e; // lease lost → propagate (resumable)
      // Budget exhausted = the model did not converge. Return quietly and let the
      // kernel's green-after / holdout gates route it to NEEDS_HUMAN, rather than
      // crash-looping the run.
      if (e instanceof Error && /exceeded maxSteps/.test(e.message)) return;
      throw e; // a genuine model/transport error is resumable — let it propagate
    }
  }

  /** Route a tool call to the capability. Policy denials are fed back to the model
   *  as an error string (so it can adapt); an abort propagates. */
  private async runTool(ctx: RepairContext, name: string, input: unknown): Promise<string> {
    const args = (input ?? {}) as { path?: unknown; content?: unknown };
    try {
      switch (name) {
        case "list_files":
          return (await ctx.listFiles()).join("\n") || "(no files)";
        case "read_file":
          return await ctx.readFile(String(args.path));
        case "write_file":
          await ctx.writeFile(String(args.path), String(args.content ?? ""));
          return `wrote ${String(args.path)}`;
        case "run_check": {
          const r = await ctx.runCheck();
          return r.exitCode === 0 ? "PASS" : `FAIL (exit ${r.exitCode})\n${r.stderr}`.trim();
        }
        default:
          return `Error: unknown tool "${name}"`;
      }
    } catch (e) {
      if (ctx.signal.aborted) throw e; // abort is not a tool error — propagate
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
