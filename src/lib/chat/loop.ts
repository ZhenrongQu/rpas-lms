import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, runTool, type ToolContext } from "./tools";
import { buildSystemPrompt } from "./systemPrompt";

// Chat answers are short; keep latency low and cap per-turn output. MAX_STEPS is
// the harness safety valve — it bounds how many think→act→feed-back loops one
// user message can trigger, so a confused model can't spin forever or run up cost.
const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 2048;
const MAX_STEPS = 8;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return client;
}

export type Callbacks = {
  onText: (delta: string) => void;
  onTool?: (name: string) => void;
};

/**
 * The agent loop. This IS the harness: the model decides (returns text or a
 * tool_use), we execute the tool server-side and feed the result back, and loop
 * until the model stops calling tools. Only text deltas are forwarded to the
 * user; thinking/tool_use blocks stay server-side but are appended to `messages`
 * so the next turn has full context.
 */
export async function runAssistant(
  ctx: ToolContext,
  history: Anthropic.MessageParam[],
  { onText, onTool }: Callbacks,
): Promise<void> {
  const anthropic = getClient();
  const messages: Anthropic.MessageParam[] = [...history];
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: buildSystemPrompt(ctx.locale), cache_control: { type: "ephemeral" } },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      system,
      tools: TOOLS,
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        onText(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    messages.push({ role: "assistant", content: final.content }); // keep thinking + tool_use blocks

    if (final.stop_reason !== "tool_use") return;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type === "tool_use") {
        onTool?.(block.name);
        const out = await runTool(block.name, block.input, ctx);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  onText(
    ctx.locale === "ZH"
      ? "\n\n（这个问题步骤有点多，麻烦把它拆细一点再问我。）"
      : "\n\n(That took too many steps — please narrow the question and ask again.)",
  );
}
