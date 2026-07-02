import type Anthropic from "@anthropic-ai/sdk";
import { BudgetExhausted, runAgent, type AgentConfig, type AgentStepInfo, type MessageCreator } from "../../runtime";
import type { RepairContext, Repairer } from "../repair";
import { REPAIR_SYSTEM_PROMPT, REPAIR_TASK, REPAIR_TOOLS } from "./prompt";

// DEFAULT author model: Haiku is a deliberately modest author (cheap, and MORE
// likely to err/over-reach — which stress-tests the deterministic verify +
// capability sandbox). The "production author" model is a config choice — eval
// overrides via REPAIR_EVAL_MODEL, and `model` here sets it per instance.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_STEPS = 12;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_TOTAL_TOKENS = 200_000; // hard cost ceiling so a runaway loop is bounded
const MAX_LIST_FILES = 200;
const MAX_TOOL_OUTPUT_BYTES = 8192; // cap list/check output fed back into the model context

function reqString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.length === 0) throw new Error(`"${field}" must be a non-empty string`);
  return v;
}
function clip(s: string): string {
  return Buffer.byteLength(s) <= MAX_TOOL_OUTPUT_BYTES ? s : `${s.slice(0, MAX_TOOL_OUTPUT_BYTES)}\n…(truncated)`;
}

export type LlmRepairerOptions = {
  model?: string;
  maxSteps?: number;
  maxTokens?: number;
  maxTotalTokens?: number;
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
      maxTotalTokens: this.opts.maxTotalTokens ?? DEFAULT_MAX_TOTAL_TOKENS,
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
      // Budget exhausted (steps or total tokens) = the model did not converge.
      // Return quietly and let the kernel's green-after / holdout gates route it to
      // NEEDS_HUMAN, rather than crash-looping the run.
      if (e instanceof BudgetExhausted) return;
      throw e; // a genuine model/transport error is resumable — let it propagate
    }
  }

  /** Route a tool call to the capability. Policy denials are fed back to the model
   *  as an error string (so it can adapt); an abort propagates. */
  private async runTool(ctx: RepairContext, name: string, input: unknown): Promise<string> {
    const args = (input ?? {}) as Record<string, unknown>;
    try {
      switch (name) {
        case "list_files": {
          const files = await ctx.listFiles();
          const shown = files.slice(0, MAX_LIST_FILES);
          const more = files.length > shown.length ? `\n…(+${files.length - shown.length} more)` : "";
          return clip(shown.join("\n") + more) || "(no files)";
        }
        case "read_file":
          return await ctx.readFile(reqString(args.path, "path")); // read size/binary capped by the capability
        case "write_file": {
          const path = reqString(args.path, "path");
          if (typeof args.content !== "string") throw new Error('"content" must be a string'); // no [object Object] coercion
          await ctx.writeFile(path, args.content);
          return `wrote ${path} (${Buffer.byteLength(args.content)} bytes)`;
        }
        case "run_check": {
          const r = await ctx.runCheck();
          return r.exitCode === 0 ? "PASS" : clip(`FAIL (exit ${r.exitCode})\n${r.stderr}`.trim());
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
