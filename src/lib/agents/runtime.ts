import Anthropic from "@anthropic-ai/sdk";

/**
 * Generic agent runtime — the reusable *mechanism*, with no SDLC/domain knowledge.
 * Generalized from the chat assistant's loop (src/lib/agents/chat/loop.ts): the
 * model decides, we (optionally) run a tool and feed the result back, and loop
 * until it stops calling tools. Unlike the chat loop this is NON-streaming — a
 * stage/repair agent produces one artifact, not a live token stream — so we
 * collect the final text and return it with the token count.
 *
 * Seams (all optional, backward compatible): `signal` aborts the request + loop;
 * `onStep` observes each step (for tracing); `thinking` passes through; and
 * `createMessage` injects a model implementation so tests run hermetically with a
 * scripted mock instead of the network.
 */

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_STEPS = 8; // safety valve, mirrors loop.ts MAX_STEPS

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return client;
}

/** Thrown when the loop hits a budget cap — a typed signal, so callers degrade on
 *  the TYPE rather than matching an error string. Carries the tokens spent. */
export class BudgetExhausted extends Error {
  constructor(
    readonly reason: "maxSteps" | "maxTotalTokens",
    readonly tokens: number,
  ) {
    super(`agent budget exhausted (${reason}) after ${tokens} tokens`);
    this.name = "BudgetExhausted";
  }
}

/** The one call the loop makes — injectable so tests can script the model. */
export type MessageCreator = (
  params: Anthropic.MessageCreateParamsNonStreaming,
  options?: { signal?: AbortSignal },
) => Promise<Anthropic.Message>;

export type AgentStepInfo = {
  index: number;
  text: string;
  toolCalls: { name: string; input: unknown }[];
  tokens: number;
  stopReason: string | null;
};

export type AgentConfig = {
  system: string;
  tools?: Anthropic.Tool[];
  /** Executes a tool call server-side and returns its string result. Required iff `tools` is set. */
  runTool?: (name: string, input: unknown) => Promise<string>;
  model?: string;
  maxTokens?: number;
  maxSteps?: number;
  /** Hard cap on CUMULATIVE tokens (input+output, all steps). maxTokens only bounds
   *  a single call's output; this bounds total spend. Undefined = no cap. */
  maxTotalTokens?: number;
  /** Hard cap on tool calls EXECUTED per step. maxSteps bounds round-trips, but one
   *  response can emit many tool_use blocks; this bounds subprocess/fs work per step.
   *  Excess calls return an unexecuted error result. Undefined = no cap. */
  maxToolCallsPerStep?: number;
  signal?: AbortSignal;
  thinking?: Anthropic.ThinkingConfigParam;
  onStep?: (step: AgentStepInfo) => void;
  createMessage?: MessageCreator;
};

export type AgentResult = {
  text: string;
  /** input + output tokens summed across all steps of this run. */
  tokens: number;
};

export async function runAgent(config: AgentConfig, input: string): Promise<AgentResult> {
  const create: MessageCreator = config.createMessage ?? ((p, o) => getClient().messages.create(p, o));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: input }];
  const tools = config.tools ?? [];
  const maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
  const thinking = config.thinking;
  const thinkingBudget = thinking?.type === "enabled" ? thinking.budget_tokens : 0;
  let tokens = 0;

  for (let step = 0; step < maxSteps; step++) {
    if (config.signal?.aborted) throw new Error("runAgent aborted");
    // The cost ceiling is INCLUSIVE: cumulative usage may reach maxTotalTokens but
    // not exceed it. Clamp this call's output to whatever budget remains so one
    // response can't blow past the cap. With extended thinking, max_tokens MUST be
    // larger than the thinking budget — if the remainder can't fund a legal request,
    // stop cleanly (BudgetExhausted) instead of sending a doomed request the API
    // would reject as an opaque transport error. (Input tokens are only known AFTER
    // the call, so this bounds OUTPUT; the post-call check is the real hard stop.)
    let maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    if (config.maxTotalTokens !== undefined) {
      const remaining = config.maxTotalTokens - tokens;
      const minRequest = thinkingBudget > 0 ? thinkingBudget + 1 : 1;
      if (remaining < minRequest) throw new BudgetExhausted("maxTotalTokens", tokens);
      maxTokens = Math.max(minRequest, Math.min(maxTokens, remaining));
    }

    const res = await create(
      {
        model: config.model ?? DEFAULT_MODEL,
        max_tokens: maxTokens,
        system: config.system,
        tools: tools.length ? tools : undefined,
        thinking: config.thinking,
        messages,
      },
      { signal: config.signal },
    );

    const stepTokens = (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
    tokens += stepTokens;
    messages.push({ role: "assistant", content: res.content });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    config.onStep?.({
      index: step,
      text,
      toolCalls: toolUses.map((b) => ({ name: b.name, input: b.input })),
      tokens: stepTokens,
      stopReason: res.stop_reason,
    });

    // Post-call HARD stop: actual usage may have overshot (input tokens were
    // unknown pre-call). The cap is inclusive, so reject only when usage strictly
    // EXCEEDS it — an answer landing exactly at the cap is kept. Fires even on a
    // final end_turn: an over-budget answer is not trusted, so throw not return.
    if (config.maxTotalTokens !== undefined && tokens > config.maxTotalTokens) {
      throw new BudgetExhausted("maxTotalTokens", tokens);
    }

    if (res.stop_reason !== "tool_use") {
      return { text, tokens };
    }

    // Run each tool call and feed results back — but EXECUTE at most
    // maxToolCallsPerStep of them. maxSteps bounds round-trips; without this a
    // single response with N tool_use blocks could spawn N subprocesses / fs ops,
    // escaping that budget. Excess calls get an unexecuted error result (every
    // tool_use still needs a matching tool_result to keep the request well-formed).
    const toolCap = config.maxToolCallsPerStep ?? Infinity;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const [i, block] of toolUses.entries()) {
      const out =
        i >= toolCap
          ? `Error: per-step tool-call budget exceeded (max ${toolCap}); this call was NOT executed`
          : config.runTool
            ? await config.runTool(block.name, block.input)
            : "(no tool runner configured)";
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new BudgetExhausted("maxSteps", tokens);
}
