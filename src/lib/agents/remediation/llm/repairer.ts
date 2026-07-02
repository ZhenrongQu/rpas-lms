import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { BudgetExhausted, runAgent, type AgentConfig, type AgentStepInfo, type MessageCreator } from "../../runtime";
import type { RepairContext, Repairer, RepairReport, RepairTraceStep } from "../repair";
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
const TRUNC_MARK = "\n…(truncated)";
// Persisted-trace bounds — every field is capped so the stored trace is bounded
// regardless of model output. Total ≤ MAX_TRACE_STEPS × (reasoning + tools).
const MAX_REASONING_BYTES = 500; // truncate persisted reasoning summaries
const MAX_NAME_BYTES = 64; // tool name (defensive; our schema names are short)
const MAX_PATH_BYTES = 256; // tool path
const MAX_TOOLS_PER_STEP = 16; // tool calls recorded per step
const MAX_TRACE_STEPS = 24; // steps recorded overall (raw `steps` still holds all)

function reqString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.length === 0) throw new Error(`"${field}" must be a non-empty string`);
  return v;
}
/** Truncate to at most maxBytes of UTF-8, never splitting a multi-byte codepoint. */
function byteTruncate(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= maxBytes) return s;
  let end = maxBytes;
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end--; // back off UTF-8 continuation bytes
  return buf.toString("utf8", 0, end);
}
function clip(s: string): string {
  if (Buffer.byteLength(s) <= MAX_TOOL_OUTPUT_BYTES) return s;
  return byteTruncate(s, MAX_TOOL_OUTPUT_BYTES - Buffer.byteLength(TRUNC_MARK)) + TRUNC_MARK; // total ≤ MAX_TOOL_OUTPUT_BYTES
}

/** Redact a raw step into a persist-safe, byte-bounded trace entry: no raw file
 *  content or full model text — only a byte-count + short hash of written content,
 *  and byte-truncated reasoning/path (all fields explicitly capped). */
function redactStep(s: AgentStepInfo): RepairTraceStep {
  return {
    step: s.index,
    tokens: s.tokens,
    reasoning: byteTruncate(s.text, MAX_REASONING_BYTES),
    tools: s.toolCalls.slice(0, MAX_TOOLS_PER_STEP).map((t) => {
      const a = (t.input ?? {}) as Record<string, unknown>;
      const path = typeof a.path === "string" ? byteTruncate(a.path, MAX_PATH_BYTES) : undefined;
      const content = typeof a.content === "string" ? a.content : undefined;
      return {
        name: byteTruncate(t.name, MAX_NAME_BYTES),
        ...(path !== undefined ? { path } : {}),
        ...(content !== undefined
          ? { contentBytes: Buffer.byteLength(content), contentSha256: createHash("sha256").update(content).digest("hex").slice(0, 16) }
          : {}),
      };
    }),
  };
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
  /** The raw in-memory steps of the last repair() (for the eval's counts/tokens). */
  readonly steps: AgentStepInfo[] = [];
  /** The redacted, persist-safe report of the last repair(). */
  lastReport: RepairReport | null = null;

  constructor(private readonly opts: LlmRepairerOptions = {}) {}

  async repair(ctx: RepairContext): Promise<RepairReport> {
    this.steps.length = 0;
    const trace: RepairTraceStep[] = [];
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
        if (trace.length < MAX_TRACE_STEPS) trace.push(redactStep(s)); // bound total persisted trace
        this.opts.onStep?.(s);
      },
    };

    try {
      await runAgent(config, REPAIR_TASK);
    } catch (e) {
      if (ctx.signal.aborted) throw e; // lease lost → propagate (resumable)
      // Budget exhausted (steps or total tokens) = the model did not converge; keep
      // the partial trace and return quietly so the kernel's green-after / holdout
      // gates route it to NEEDS_HUMAN, rather than crash-looping the run.
      if (!(e instanceof BudgetExhausted)) throw e; // a genuine model/transport error is resumable
    }

    const report: RepairReport = { trace, tokens: trace.reduce((n, t) => n + t.tokens, 0) };
    this.lastReport = report;
    return report;
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
