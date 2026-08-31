import { beforeEach, describe, it, expect } from "vitest";
import { prisma } from "../../db";
import { recordTurn } from "./turnLog";
import type { AssistantRun } from "./loop";

const run: AssistantRun = {
  model: "claude-sonnet-4-6",
  steps: 2,
  stopReason: "end_turn",
  truncated: false,
  exhaustedSteps: false,
  timedOut: false,
  toolCalls: [
    { step: 0, name: "search_course_content", input: { query: "visibility" }, output: "<retrieved_passages>VLOS requires…</retrieved_passages>" },
    { step: 1, name: "get_my_progress", input: {}, output: "Completed lessons (0): none yet" },
  ],
  inputTokens: 1200,
  outputTokens: 400,
  cacheReadTokens: 2000,
  cacheWriteTokens: 800,
  ttftMs: 850,
  totalMs: 4200,
};

const base = {
  conversationId: "conv-1",
  turnIndex: 0,
  userId: "u1",
  locale: "EN" as const,
  question: "What is the minimum visibility?",
  answer: "Under CAR 901.11 ...",
  historyTurns: 0,
  completed: true,
};

describe("recordTurn", () => {
  beforeEach(async () => {
    await prisma.assistantTurn.deleteMany();
  });

  it("records the whole turn, including cost derived from usage", async () => {
    await recordTurn({ ...base, run });

    const row = await prisma.assistantTurn.findFirstOrThrow();
    expect(row.model).toBe("claude-sonnet-4-6");
    expect(row.steps).toBe(2);
    expect(row.stopReason).toBe("end_turn");
    expect(row.completed).toBe(true);
    expect(JSON.parse(row.toolCalls)).toEqual(["search_course_content", "get_my_progress"]);
    expect(row.inputTokens).toBe(1200);
    expect(row.cacheReadTokens).toBe(2000);
    expect(row.ttftMs).toBe(850);
    expect(row.totalMs).toBe(4200);
    expect(row.costMicroUsd).toBe(1200 * 3 + 400 * 15 + 2000 * 0.3 + 800 * 3.75);
  });

  it("redacts contact details out of both the question and the answer", async () => {
    await recordTurn({
      ...base,
      question: "mail me at pilot@example.com or 604-555-0134",
      answer: "Sure — pilot@example.com noted.",
      run,
    });

    const row = await prisma.assistantTurn.findFirstOrThrow();
    expect(row.question).toBe("mail me at [email] or [number]");
    expect(row.answer).toBe("Sure — [email] noted.");
  });

  // The turn a naive implementation loses: the route already sent HTTP 200, so
  // nothing downstream knows this one failed unless the row says so.
  it("records a turn that broke mid-stream as incomplete", async () => {
    await recordTurn({
      ...base,
      answer: "The minimum visibility is",
      completed: false,
      errorKind: "APIConnectionError",
      run: { ...run, stopReason: null },
    });

    const row = await prisma.assistantTurn.findFirstOrThrow();
    expect(row.completed).toBe(false);
    expect(row.errorKind).toBe("APIConnectionError");
  });

  it("records a truncated answer so the rate is queryable", async () => {
    await recordTurn({ ...base, run: { ...run, stopReason: "max_tokens", truncated: true } });

    const row = await prisma.assistantTurn.findFirstOrThrow();
    expect(row.truncated).toBe(true);
    expect(row.stopReason).toBe("max_tokens");
  });

  // No model call happened, but it is still a turn the student experienced, and
  // "how often do we refuse" is the measurement the scope gate needs before it
  // can be turned on.
  it("records a scope-gate refusal with no model and no cost", async () => {
    await recordTurn({
      ...base,
      answer: "I'm the study assistant for this RPAS course...",
      stopReason: "scope_refused",
    });

    const row = await prisma.assistantTurn.findFirstOrThrow();
    expect(row.model).toBe("none");
    expect(row.stopReason).toBe("scope_refused");
    expect(row.steps).toBe(0);
    expect(row.costMicroUsd).toBe(0);
  });

  // The field that makes hallucination gradeable: an answer citing "CAR 901.67"
  // is only a failure if the retrieved passages did not contain it, and without
  // the passages nobody — human or judge — can tell.
  it("stores what each tool returned, not just that it was called", async () => {
    await recordTurn({ ...base, run });

    const row = await prisma.assistantTurn.findFirstOrThrow();
    const trace = JSON.parse(row.toolTrace!) as { name: string; output: string }[];
    expect(trace).toHaveLength(2);
    expect(trace[0]!.name).toBe("search_course_content");
    expect(trace[0]!.output).toContain("VLOS requires");
  });

  it("redacts the tool input but keeps the output whole", async () => {
    await recordTurn({
      ...base,
      run: {
        ...run,
        toolCalls: [
          {
            step: 0,
            name: "search_course_content",
            input: { query: "reach me at pilot@example.com" },
            // Course material, and the evidence a grounding call rests on — a
            // redactor eating a figure here would manufacture false failures.
            output: "Minimum visibility is 3 statute miles; contact 604-555-0134 is not in here",
          },
        ],
      },
    });

    const row = await prisma.assistantTurn.findFirstOrThrow();
    const trace = JSON.parse(row.toolTrace!) as { input: string; output: string }[];
    expect(trace[0]!.input).toContain("[email]");
    expect(trace[0]!.input).not.toContain("pilot@example.com");
    expect(trace[0]!.output).toContain("3 statute miles");
  });

  it("caps an oversized tool output rather than storing it whole", async () => {
    await recordTurn({
      ...base,
      run: { ...run, toolCalls: [{ step: 0, name: "search_course_content", input: {}, output: "x".repeat(20_000) }] },
    });

    const row = await prisma.assistantTurn.findFirstOrThrow();
    const trace = JSON.parse(row.toolTrace!) as { output: string }[];
    expect(trace[0]!.output).toContain("[truncated 12000 chars]");
    expect(trace[0]!.output.length).toBeLessThan(20_000);
  });

  it("leaves toolTrace null when no model call happened", async () => {
    await recordTurn({ ...base, stopReason: "scope_refused" });
    const row = await prisma.assistantTurn.findFirstOrThrow();
    expect(row.toolTrace).toBeNull();
  });

  // Property 1: the student already has their answer. Logging must not be able to
  // turn into a user-visible failure.
  it("swallows a write failure instead of surfacing it to the caller", async () => {
    const exploding = {
      assistantTurn: {
        create: async () => {
          throw new Error("connection pool exhausted");
        },
      },
    };

    await expect(recordTurn({ ...base, run }, exploding)).resolves.toBeUndefined();
    expect(await prisma.assistantTurn.count()).toBe(0);
  });
});
