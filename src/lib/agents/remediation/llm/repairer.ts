import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { BudgetExhausted, runAgent, type AgentConfig, type AgentStepInfo, type MessageCreator } from "../../runtime";
import type { RepairContext, Repairer, RepairReport, RepairToolStatus, RepairTraceStep } from "../repair";
import { InfrastructureFailure } from "../substrate";
import { REPAIR_SYSTEM_PROMPT, REPAIR_TASK, REPAIR_TOOLS } from "./prompt";

type RedactedTool = RepairTraceStep["tools"][number];

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
const MAX_TOOL_CALLS_PER_STEP = 8; // tool calls EXECUTED per step (bounds subprocess/fs work)

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

/** Redact one tool call into a persist-safe, byte-bounded trace entry stamped with
 *  its ACTUAL disposition — no raw file content or full model text: only a
 *  byte-count + short hash of written content, and byte-truncated name/path. */
function redactTool(name: string, input: unknown, status: RepairToolStatus): RedactedTool {
  const a = (input ?? {}) as Record<string, unknown>;
  const path = typeof a.path === "string" ? byteTruncate(a.path, MAX_PATH_BYTES) : undefined;
  const content = typeof a.content === "string" ? a.content : undefined;
  return {
    name: byteTruncate(name, MAX_NAME_BYTES),
    status,
    ...(path !== undefined ? { path } : {}),
    ...(content !== undefined
      ? { contentBytes: Buffer.byteLength(content), contentSha256: createHash("sha256").update(content).digest("hex").slice(0, 16) }
      : {}),
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
  readonly trusted = false;
  /** The raw in-memory steps of the last repair() (for the eval's counts/tokens). */
  readonly steps: AgentStepInfo[] = [];
  /** The redacted, persist-safe report of the last repair(). */
  lastReport: RepairReport | null = null;
  /** FIFO of redacted entries for EXECUTED tools, produced in runTool and drained
   *  in onToolResult so the persisted trace reflects what actually ran. */
  private readonly pending: RedactedTool[] = [];

  constructor(private readonly opts: LlmRepairerOptions = {}) {}

  async repair(ctx: RepairContext): Promise<RepairReport> {
    this.steps.length = 0;
    this.pending.length = 0;
    const trace: RepairTraceStep[] = [];
    const byStep = new Map<number, RepairTraceStep>();
    const config: AgentConfig = {
      system: REPAIR_SYSTEM_PROMPT,
      tools: REPAIR_TOOLS,
      runTool: (name, input) => this.runTool(ctx, name, input),
      model: this.opts.model ?? DEFAULT_MODEL,
      maxSteps: this.opts.maxSteps ?? DEFAULT_MAX_STEPS,
      maxTokens: this.opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      maxTotalTokens: this.opts.maxTotalTokens ?? DEFAULT_MAX_TOTAL_TOKENS,
      maxToolCallsPerStep: MAX_TOOL_CALLS_PER_STEP,
      thinking: this.opts.thinking,
      signal: ctx.signal,
      createMessage: this.opts.createMessage,
      onStep: (s) => {
        this.steps.push(s);
        if (trace.length < MAX_TRACE_STEPS) {
          // Skeleton only — reasoning/tokens now; tools are filled from ACTUAL
          // execution events (onToolResult), so a requested-but-skipped call never
          // masquerades as executed in the persisted trace.
          const entry: RepairTraceStep = { step: s.index, tokens: s.tokens, reasoning: byteTruncate(s.text, MAX_REASONING_BYTES), tools: [] };
          trace.push(entry);
          byStep.set(s.index, entry);
        }
        this.opts.onStep?.(s);
      },
      onToolResult: (r) => {
        // Executed calls carry the runTool-classified entry (executed|denied) off
        // the pending queue; skipped calls are synthesized here. Always drain
        // pending for an executed call so it stays aligned past MAX_TRACE_STEPS.
        const tool = r.executed ? this.pending.shift() : redactTool(r.name, r.input, "skipped_budget");
        const entry = byStep.get(r.step);
        if (entry && tool && entry.tools.length < MAX_TOOLS_PER_STEP) entry.tools.push(tool);
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

  /** Route a tool call to the capability and CLASSIFY its outcome for the trace:
   *  a successful run → "executed"; a policy/validation rejection → "denied" (its
   *  message is still fed back so the model can adapt); an abort propagates. */
  private async runTool(ctx: RepairContext, name: string, input: unknown): Promise<string> {
    const args = (input ?? {}) as Record<string, unknown>;
    try {
      const out = await this.dispatch(ctx, name, args);
      this.pending.push(redactTool(name, args, "executed"));
      return out;
    } catch (e) {
      // Abort (lease) and infrastructure failures are NOT tool errors — propagate
      // them (no trace entry) rather than feeding them back to the model as "denied".
      if (ctx.signal.aborted || e instanceof InfrastructureFailure) throw e;
      this.pending.push(redactTool(name, args, "denied"));
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /** Execute one tool against the capability. THROWS on a denial/validation failure
   *  so runTool can classify it; the pinned check / allowlist enforce the sandbox. */
  private async dispatch(ctx: RepairContext, name: string, args: Record<string, unknown>): Promise<string> {
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
        throw new Error(`unknown tool "${name}"`);
    }
  }
}
