import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { BudgetExhausted, runAgent, type MessageCreator, type AgentStepInfo } from "./runtime";

// Hermetic: the model is injected via createMessage, so no network / no API key.
const textBlock = (text: string) => ({ type: "text", text, citations: null });
const toolBlock = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

function fakeMsg(content: unknown[], stopReason: string, inputTokens = 2, outputTokens = 3): Anthropic.Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "mock",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  } as unknown as Anthropic.Message;
}

function scripted(responses: Anthropic.Message[]): {
  create: MessageCreator;
  calls: Anthropic.MessageCreateParamsNonStreaming[];
} {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let i = 0;
  const create: MessageCreator = async (params) => {
    calls.push(params);
    return responses[Math.min(i++, responses.length - 1)]!;
  };
  return { create, calls };
}

const noopTool = (name: string): Anthropic.Tool => ({ name, description: "", input_schema: { type: "object" } });

describe("runAgent", () => {
  it("returns text and summed tokens when the model stops without tools", async () => {
    const { create } = scripted([fakeMsg([textBlock("hello")], "end_turn", 5, 3)]);
    expect(await runAgent({ system: "s", createMessage: create }, "hi")).toEqual({ text: "hello", tokens: 8 });
  });

  it("runs a tool and feeds the result back until the model finishes", async () => {
    const { create } = scripted([
      fakeMsg([toolBlock("t1", "read_file", { path: "x" })], "tool_use", 4, 4),
      fakeMsg([textBlock("done")], "end_turn", 2, 2),
    ]);
    const toolCalls: [string, unknown][] = [];
    const res = await runAgent(
      {
        system: "s",
        tools: [noopTool("read_file")],
        runTool: async (name, input) => {
          toolCalls.push([name, input]);
          return "FILE";
        },
        createMessage: create,
      },
      "fix it",
    );
    expect(res).toEqual({ text: "done", tokens: 12 });
    expect(toolCalls).toEqual([["read_file", { path: "x" }]]);
  });

  it("fires onStep per step with tool calls and tokens", async () => {
    const { create } = scripted([
      fakeMsg([toolBlock("t1", "run_check", {})], "tool_use", 1, 1),
      fakeMsg([textBlock("ok")], "end_turn", 1, 1),
    ]);
    const steps: AgentStepInfo[] = [];
    await runAgent(
      { system: "s", tools: [noopTool("run_check")], runTool: async () => "green", createMessage: create, onStep: (s) => steps.push(s) },
      "go",
    );
    expect(steps).toHaveLength(2);
    expect(steps[0]!.toolCalls).toEqual([{ name: "run_check", input: {} }]);
    expect(steps[1]!.toolCalls).toEqual([]);
    expect(steps[1]!.text).toBe("ok");
  });

  it("aborts when the signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const { create } = scripted([fakeMsg([textBlock("nope")], "end_turn")]);
    await expect(runAgent({ system: "s", createMessage: create, signal: ctrl.signal }, "x")).rejects.toThrow(/abort/i);
  });

  it("throws BudgetExhausted(maxSteps) when steps run out without a final answer", async () => {
    const { create } = scripted([fakeMsg([toolBlock("t", "noop", {})], "tool_use")]); // always tool_use
    const err = await runAgent(
      { system: "s", tools: [noopTool("noop")], runTool: async () => "x", createMessage: create, maxSteps: 2 },
      "x",
    ).catch((e) => e);
    expect(err).toBeInstanceOf(BudgetExhausted);
    expect((err as BudgetExhausted).reason).toBe("maxSteps");
  });

  it("throws BudgetExhausted(maxTotalTokens) once the cumulative-token cap is hit", async () => {
    const { create } = scripted([fakeMsg([toolBlock("t", "noop", {})], "tool_use")]); // 5 tokens/step, never stops
    const err = await runAgent(
      { system: "s", tools: [noopTool("noop")], runTool: async () => "x", createMessage: create, maxTotalTokens: 8 },
      "x",
    ).catch((e) => e);
    expect(err).toBeInstanceOf(BudgetExhausted);
    expect((err as BudgetExhausted).reason).toBe("maxTotalTokens");
  });

  it("enforces the cap post-call: an over-budget FINAL end_turn still throws (not returned)", async () => {
    const { create } = scripted([fakeMsg([textBlock("huge answer")], "end_turn", 5, 30)]); // 35 tokens in ONE call
    const err = await runAgent({ system: "s", createMessage: create, maxTotalTokens: 10 }, "x").catch((e) => e);
    expect(err).toBeInstanceOf(BudgetExhausted);
    expect((err as BudgetExhausted).reason).toBe("maxTotalTokens");
    expect((err as BudgetExhausted).tokens).toBe(35);
  });

  it("clamps a call's max_tokens to the remaining total budget", async () => {
    const { create, calls } = scripted([
      fakeMsg([toolBlock("t", "noop", {})], "tool_use", 3, 3), // 6 tokens → 4 of 10 remain
      fakeMsg([textBlock("done")], "end_turn", 1, 1),
    ]);
    const res = await runAgent(
      { system: "s", tools: [noopTool("noop")], runTool: async () => "x", createMessage: create, maxTotalTokens: 10, maxTokens: 4096 },
      "x",
    );
    expect(res.tokens).toBe(8);
    expect(calls[0]!.max_tokens).toBe(10); // first call clamped to the full budget
    expect(calls[1]!.max_tokens).toBe(4); // second call clamped to what remains (10 - 6)
  });

  it("accepts an answer that lands exactly at the token cap (inclusive ceiling)", async () => {
    const { create } = scripted([fakeMsg([textBlock("done")], "end_turn", 4, 6)]); // exactly 10
    const res = await runAgent({ system: "s", createMessage: create, maxTotalTokens: 10 }, "x");
    expect(res).toEqual({ text: "done", tokens: 10 }); // at the cap, not over → kept
  });

  it("executes at most maxToolCallsPerStep tools; excess return an unexecuted error", async () => {
    const many = Array.from({ length: 50 }, (_, i) => toolBlock(`t${i}`, "run_check", {}));
    const { create } = scripted([fakeMsg(many, "tool_use"), fakeMsg([textBlock("done")], "end_turn")]);
    let executed = 0;
    await runAgent(
      { system: "s", tools: [noopTool("run_check")], runTool: async () => (executed++, "x"), createMessage: create, maxToolCallsPerStep: 4 },
      "go",
    );
    expect(executed).toBe(4); // 50 tool_use blocks, only 4 subprocesses spawned
  });

  it("reports each tool's disposition via onToolResult (executed vs skipped)", async () => {
    const three = ["a", "b", "c"].map((id) => toolBlock(id, "run_check", {}));
    const { create } = scripted([fakeMsg(three, "tool_use"), fakeMsg([textBlock("done")], "end_turn")]);
    const seen: { name: string; executed: boolean }[] = [];
    await runAgent(
      {
        system: "s",
        tools: [noopTool("run_check")],
        runTool: async () => "x",
        createMessage: create,
        maxToolCallsPerStep: 2,
        onToolResult: (r) => seen.push({ name: r.name, executed: r.executed }),
      },
      "go",
    );
    expect(seen).toEqual([
      { name: "run_check", executed: true },
      { name: "run_check", executed: true },
      { name: "run_check", executed: false }, // 3rd is over budget → recorded, not run
    ]);
  });

  it("stops cleanly (BudgetExhausted) rather than send a request too small for the thinking budget", async () => {
    let calls = 0;
    const create: MessageCreator = async () => (calls++, fakeMsg([textBlock("x")], "end_turn"));
    const err = await runAgent(
      { system: "s", createMessage: create, thinking: { type: "enabled", budget_tokens: 1024 }, maxTotalTokens: 500 },
      "x",
    ).catch((e) => e);
    expect(err).toBeInstanceOf(BudgetExhausted);
    expect(calls).toBe(0); // never sent the doomed request the API would reject
  });
});
