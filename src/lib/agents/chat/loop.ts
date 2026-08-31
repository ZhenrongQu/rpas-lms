import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, runTool, type ToolContext } from "./tools";
import { buildSystemPrompt } from "./systemPrompt";

// Chat answers are short; keep latency low and cap per-turn output. MAX_STEPS is
// the harness safety valve — it bounds how many think→act→feed-back loops one
// user message can trigger, so a confused model can't spin forever or run up cost.
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;
const MAX_STEPS = 8;

// Two budgets the loop previously had neither of:
//
//  - REQUEST_TIMEOUT_MS bounds ONE model call. The SDK's default is 10 minutes,
//    which is not a timeout on a route the platform will kill in 60 seconds — it
//    just guarantees the platform wins, and a platform kill produces a truncated
//    stream with no error and no log line.
//  - DEADLINE_MS bounds the WHOLE loop. A per-call timeout can't do that: eight
//    steps each finishing just inside their own limit still blows the function
//    budget. Checked between steps, so it degrades into a normal reply rather
//    than a severed connection. Kept under the route's maxDuration so the loop,
//    not the platform, is what stops us — the difference is whether the turn
//    gets recorded.
const REQUEST_TIMEOUT_MS = 30_000;
const DEADLINE_MS = 50_000;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return client;
}

/** The one call the loop makes. Injectable so tests can script the model and
 *  exercise stop_reason branches (truncation, step exhaustion) without network
 *  or spend — the same seam runtime.ts exposes as `createMessage`. */
export type StreamFactory = (params: Anthropic.MessageStreamParams) => {
  [Symbol.asyncIterator](): AsyncIterator<Anthropic.MessageStreamEvent>;
  finalMessage(): Promise<Anthropic.Message>;
};

export type Callbacks = {
  onText: (delta: string) => void;
  onTool?: (name: string) => void;
  /** Injected model. Defaults to the real Anthropic client. */
  createStream?: StreamFactory;
  /** Injected clock, so deadline behaviour is testable without waiting. */
  now?: () => number;
};

/** What the turn actually did. The route persists this: every field here is a
 *  question the audit could not answer from production ("how often do we
 *  truncate?", "what did one answer cost?", "what is P95?"). */
export type AssistantRun = {
  model: string;
  steps: number;
  stopReason: string | null;
  /** stop_reason was max_tokens — the answer is cut off mid-thought. */
  truncated: boolean;
  /** The model was still calling tools when MAX_STEPS ran out. */
  exhaustedSteps: boolean;
  /** The wall-clock budget ran out between steps. */
  timedOut: boolean;
  toolCalls: string[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Time to first text delta, in ms. Null when the turn produced no text. */
  ttftMs: number | null;
  totalMs: number;
};

/** Put the cache breakpoint on the LAST block of the LAST message.
 *
 * It used to sit on the system block, which caches the [tools + system] prefix —
 * about 700 tokens, under the 1024-token minimum, so it silently never cached
 * and `cache_read` was structurally always 0. Moving it here makes the cached
 * prefix [tools + system + the whole conversation so far], which clears the
 * minimum after the first exchange and grows with the conversation — and the
 * conversation is the part that gets re-sent on every step and every turn, so it
 * is the part worth caching.
 *
 * Returns a shallow copy: the caller's array (and the caller's history) is left
 * alone, and the previous turn's breakpoint does not accumulate. */
function withCacheBreakpoint(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = messages[messages.length - 1];
  if (!last) return messages;

  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === "string"
      ? [{ type: "text", text: last.content }]
      : [...last.content];

  // Thinking blocks are the one content type that cannot carry cache_control.
  // The loop only ever calls this with a user message last (the incoming turn, or
  // a tool_result batch), so this guard is belt-and-braces — but it is the kind of
  // 400 that would only show up in production.
  const tail = blocks[blocks.length - 1];
  if (!tail || tail.type === "thinking" || tail.type === "redacted_thinking") return messages;
  blocks[blocks.length - 1] = { ...tail, cache_control: { type: "ephemeral" } };

  return [...messages.slice(0, -1), { role: last.role, content: blocks }];
}

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
  { onText, onTool, createStream, now = Date.now }: Callbacks,
): Promise<AssistantRun> {
  const createStreamFn: StreamFactory =
    createStream ?? ((params) => getClient().messages.stream(params, { timeout: REQUEST_TIMEOUT_MS }));

  const messages: Anthropic.MessageParam[] = [...history];
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: buildSystemPrompt(ctx.locale) }];

  const startedAt = now();
  const run: AssistantRun = {
    model: MODEL,
    steps: 0,
    stopReason: null,
    truncated: false,
    exhaustedSteps: false,
    timedOut: false,
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ttftMs: null,
    totalMs: 0,
  };
  const finish = (): AssistantRun => {
    run.totalMs = now() - startedAt;
    return run;
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    // Between-steps deadline check. Step 0 always runs: refusing to start on a
    // slow-but-not-yet-late request would fail a turn we could still serve.
    if (step > 0 && now() - startedAt > DEADLINE_MS) {
      run.timedOut = true;
      onText(
        ctx.locale === "ZH"
          ? "\n\n（这个问题查得有点久,我先停在这里。麻烦把它问得更具体一点。）"
          : "\n\n(This one is taking too long to look up — stopping here. Please ask it more specifically.)",
      );
      return finish();
    }

    const stream = createStreamFn({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      system,
      tools: TOOLS,
      messages: withCacheBreakpoint(messages),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        if (run.ttftMs === null) run.ttftMs = now() - startedAt;
        onText(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    run.steps = step + 1;
    run.stopReason = final.stop_reason;

    const u = final.usage;
    run.inputTokens += u.input_tokens;
    run.outputTokens += u.output_tokens;
    run.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
    run.cacheReadTokens += u.cache_read_input_tokens ?? 0;

    messages.push({ role: "assistant", content: final.content }); // keep thinking + tool_use blocks

    // A truncated answer is not a finished answer. This branch used to fall into
    // the `!== "tool_use"` return below, so a reply cut off mid-sentence was
    // delivered as if complete — invisible to the user, to the logs, and to any
    // metric. max_tokens is shared with adaptive thinking, so it is reachable.
    if (final.stop_reason === "max_tokens") {
      run.truncated = true;
      onText(
        ctx.locale === "ZH"
          ? "\n\n（回答被长度限制截断了,没说完。让我针对其中一点单独展开会更完整。）"
          : "\n\n(This answer was cut off by a length limit. Ask me to expand on one part and I can finish it.)",
      );
      return finish();
    }

    if (final.stop_reason !== "tool_use") return finish();

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type === "tool_use") {
        run.toolCalls.push(block.name);
        onTool?.(block.name);
        const out = await runTool(block.name, block.input, ctx);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  run.exhaustedSteps = true;
  onText(
    ctx.locale === "ZH"
      ? "\n\n（这个问题步骤有点多,麻烦把它拆细一点再问我。）"
      : "\n\n(That took too many steps — please narrow the question and ask again.)",
  );
  return finish();
}
