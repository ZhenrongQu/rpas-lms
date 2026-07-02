import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgent, type MessageCreator, type AgentStepInfo } from "./runtime";

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

  it("throws when maxSteps is exceeded without a final answer", async () => {
    const { create } = scripted([fakeMsg([toolBlock("t", "noop", {})], "tool_use")]); // always tool_use
    await expect(
      runAgent({ system: "s", tools: [noopTool("noop")], runTool: async () => "x", createMessage: create, maxSteps: 2 }, "x"),
    ).rejects.toThrow(/exceeded maxSteps/);
  });
});
