import type Anthropic from "@anthropic-ai/sdk";
import { describe, it, expect } from "vitest";
import { runAssistant, type StreamFactory } from "./loop";
import type { ToolContext } from "./tools";

// Hermetic: the model is scripted through the `createStream` seam, so these
// exercise the stop_reason branches the audit found unhandled without spending a
// token. Tool calls use a name runTool doesn't know, which returns an error
// string from its default case and never touches the database.

const ctx: ToolContext = { userId: "u1", locale: "EN" };

type Scripted = {
  text?: string;
  stopReason: Anthropic.Message["stop_reason"];
  toolUse?: boolean;
  usage?: Partial<Anthropic.Usage>;
};

function message(s: Scripted): Anthropic.Message {
  const content: Anthropic.ContentBlock[] = [];
  if (s.text) content.push({ type: "text", text: s.text, citations: null });
  if (s.toolUse) content.push({ type: "tool_use", id: "tu_1", name: "nope", input: {}, caller: { type: "direct" } });
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content,
    stop_reason: s.stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      ...s.usage,
    },
  } as unknown as Anthropic.Message;
}

/** Returns a StreamFactory that plays the given script, one entry per step, and
 *  records the params it was called with. */
function scriptedModel(script: Scripted[]): {
  factory: StreamFactory;
  calls: Anthropic.MessageStreamParams[];
} {
  const calls: Anthropic.MessageStreamParams[] = [];
  let step = 0;
  const factory: StreamFactory = (params) => {
    calls.push(params);
    const s = script[Math.min(step, script.length - 1)]!;
    step += 1;
    return {
      async *[Symbol.asyncIterator]() {
        if (s.text) {
          yield {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: s.text },
          } as Anthropic.MessageStreamEvent;
        }
      },
      finalMessage: async () => message(s),
    };
  };
  return { factory, calls };
}

function collect() {
  let out = "";
  return { onText: (d: string) => (out += d), read: () => out };
}

describe("runAssistant", () => {
  it("returns cleanly on end_turn and reports usage + ttft", async () => {
    const sink = collect();
    const { factory } = scriptedModel([{ text: "Hello.", stopReason: "end_turn" }]);
    let clock = 1000;
    const run = await runAssistant(ctx, [{ role: "user", content: "hi" }], {
      onText: sink.onText,
      createStream: factory,
      now: () => (clock += 5),
    });

    expect(sink.read()).toBe("Hello.");
    expect(run.steps).toBe(1);
    expect(run.stopReason).toBe("end_turn");
    expect(run.truncated).toBe(false);
    expect(run.exhaustedSteps).toBe(false);
    expect(run.timedOut).toBe(false);
    expect(run.inputTokens).toBe(100);
    expect(run.outputTokens).toBe(20);
    expect(run.ttftMs).not.toBeNull();
    expect(run.totalMs).toBeGreaterThan(0);
  });

  // The defect: this used to fall through the `!== "tool_use"` return, handing a
  // sentence that stops mid-word to the user as though it were the whole answer.
  it("flags a max_tokens truncation and tells the user the answer is cut off", async () => {
    const sink = collect();
    const { factory } = scriptedModel([{ text: "The minimum visibility is", stopReason: "max_tokens" }]);
    const run = await runAssistant(ctx, [{ role: "user", content: "hi" }], {
      onText: sink.onText,
      createStream: factory,
    });

    expect(run.truncated).toBe(true);
    expect(run.stopReason).toBe("max_tokens");
    expect(sink.read()).toContain("cut off");
  });

  it("stops at MAX_STEPS when the model keeps calling tools, and says so", async () => {
    const sink = collect();
    const { factory, calls } = scriptedModel([{ stopReason: "tool_use", toolUse: true }]);
    const run = await runAssistant(ctx, [{ role: "user", content: "hi" }], {
      onText: sink.onText,
      createStream: factory,
    });

    expect(run.exhaustedSteps).toBe(true);
    expect(run.steps).toBe(8);
    expect(calls).toHaveLength(8);
    expect(run.toolCalls.map((c) => c.name)).toEqual(Array(8).fill("nope"));
    expect(run.inputTokens).toBe(800); // accumulated across every step
    expect(sink.read()).toContain("too many steps");
  });

  it("stops on the wall-clock deadline rather than letting the platform sever it", async () => {
    const sink = collect();
    const { factory, calls } = scriptedModel([{ stopReason: "tool_use", toolUse: true }]);
    let clock = 0;
    const run = await runAssistant(ctx, [{ role: "user", content: "hi" }], {
      onText: sink.onText,
      createStream: factory,
      now: () => (clock += 30_000), // two ticks per step: past 50s during step 1
    });

    expect(run.timedOut).toBe(true);
    expect(run.exhaustedSteps).toBe(false);
    expect(calls.length).toBeLessThan(8);
    expect(sink.read()).toContain("taking too long");
  });

  // Production showed "right away!Let me search" and "for you.Here's a checklist":
  // one step's closing word glued to the next step's opening one.
  it("separates the text of one step from the next", async () => {
    const sink = collect();
    const { factory } = scriptedModel([
      { text: "Let me look that up!", stopReason: "tool_use", toolUse: true },
      { text: "Here is what I found.", stopReason: "end_turn" },
    ]);
    await runAssistant(ctx, [{ role: "user", content: "hi" }], {
      onText: sink.onText,
      createStream: factory,
    });

    expect(sink.read()).toBe("Let me look that up!\n\nHere is what I found.");
  });

  it("adds no separator when a step produced no text of its own", async () => {
    const sink = collect();
    const { factory } = scriptedModel([
      { stopReason: "tool_use", toolUse: true }, // straight to the tool, says nothing
      { text: "Here is what I found.", stopReason: "end_turn" },
    ]);
    await runAssistant(ctx, [{ role: "user", content: "hi" }], {
      onText: sink.onText,
      createStream: factory,
    });

    expect(sink.read()).toBe("Here is what I found.");
  });

  it("records what each tool returned, not just its name", async () => {
    const { factory } = scriptedModel([
      { stopReason: "tool_use", toolUse: true },
      { text: "done", stopReason: "end_turn" },
    ]);
    const run = await runAssistant(ctx, [{ role: "user", content: "hi" }], {
      onText: () => {},
      createStream: factory,
    });

    expect(run.toolCalls).toHaveLength(1);
    expect(run.toolCalls[0]).toMatchObject({ step: 0, name: "nope" });
    // runTool's default case, fed back to the model exactly as the harness would.
    expect(run.toolCalls[0]!.output).toContain("Unknown tool");
  });

  it("puts the cache breakpoint on the last message, not the system block", async () => {
    const { factory, calls } = scriptedModel([{ text: "ok", stopReason: "end_turn" }]);
    await runAssistant(ctx, [{ role: "user", content: "hi" }], {
      onText: () => {},
      createStream: factory,
    });

    const params = calls[0]!;
    // System carries no breakpoint: [tools + system] is ~700 tokens, under the
    // 1024-token minimum, so a breakpoint there could never cache anything.
    const system = params.system as Anthropic.TextBlockParam[];
    expect(system[0]!.cache_control).toBeUndefined();

    const last = params.messages[params.messages.length - 1]!;
    const blocks = last.content as Anthropic.TextBlockParam[];
    expect(blocks[blocks.length - 1]!.cache_control).toEqual({ type: "ephemeral" });
  });

  it("does not mutate the caller's history when adding the breakpoint", async () => {
    const history: Anthropic.MessageParam[] = [{ role: "user", content: "hi" }];
    const { factory } = scriptedModel([{ text: "ok", stopReason: "end_turn" }]);
    await runAssistant(ctx, history, { onText: () => {}, createStream: factory });

    expect(history).toEqual([{ role: "user", content: "hi" }]);
  });
});
