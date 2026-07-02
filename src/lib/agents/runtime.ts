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
  let tokens = 0;

  for (let step = 0; step < maxSteps; step++) {
    if (config.signal?.aborted) throw new Error("runAgent aborted");

    const res = await create(
      {
        model: config.model ?? DEFAULT_MODEL,
        max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
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

    if (res.stop_reason !== "tool_use") {
      return { text, tokens };
    }

    // Run each tool call and feed results back.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUses) {
      const out = config.runTool
        ? await config.runTool(block.name, block.input)
        : "(no tool runner configured)";
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`runAgent exceeded maxSteps (${maxSteps}) without a final answer`);
}
