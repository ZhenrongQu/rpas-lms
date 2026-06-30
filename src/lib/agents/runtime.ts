import Anthropic from "@anthropic-ai/sdk";

/**
 * Generic agent runtime — the reusable *mechanism*, with no SDLC/domain knowledge.
 * Generalized from the chat assistant's loop (src/lib/chat/loop.ts): the model
 * decides, we (optionally) run a tool and feed the result back, and loop until it
 * stops calling tools. Unlike the chat loop this is NON-streaming — a stage agent
 * produces one artifact, not a live token stream — so we collect the final text
 * and return it together with the token count for tracing.
 *
 * v1 SDLC stages pass no tools, so this degenerates to a single drafting call;
 * the tool loop is built so adding tools later (e.g. codegraph for the RFC stage)
 * needs no change here.
 */

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_STEPS = 8; // safety valve, mirrors loop.ts MAX_STEPS

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return client;
}

export type AgentConfig = {
  system: string;
  tools?: Anthropic.Tool[];
  /** Executes a tool call server-side and returns its string result. Required iff `tools` is set. */
  runTool?: (name: string, input: unknown) => Promise<string>;
  model?: string;
  maxTokens?: number;
  maxSteps?: number;
};

export type AgentResult = {
  text: string;
  /** input + output tokens summed across all steps of this run. */
  tokens: number;
};

export async function runAgent(config: AgentConfig, input: string): Promise<AgentResult> {
  const anthropic = getClient();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: input }];
  const tools = config.tools ?? [];
  const maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
  let tokens = 0;

  for (let step = 0; step < maxSteps; step++) {
    const res = await anthropic.messages.create({
      model: config.model ?? DEFAULT_MODEL,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: config.system,
      tools: tools.length ? tools : undefined,
      messages,
    });
    tokens += (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { text, tokens };
    }

    // Reached only when tools are provided. Run each call and feed results back.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type === "tool_use") {
        const out = config.runTool
          ? await config.runTool(block.name, block.input)
          : "(no tool runner configured)";
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`runAgent exceeded maxSteps (${maxSteps}) without a final answer`);
}
