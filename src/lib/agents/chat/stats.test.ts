import { describe, it, expect } from "vitest";
import { percentile, summarise, type TurnRow } from "./stats";

const turn = (over: Partial<TurnRow> = {}): TurnRow => ({
  conversationId: "c1",
  userId: "u1",
  model: "claude-sonnet-4-6",
  stopReason: "end_turn",
  truncated: false,
  exhaustedSteps: false,
  timedOut: false,
  completed: true,
  toolCalls: "[]",
  costMicroUsd: 1000,
  ttftMs: 500,
  totalMs: 2000,
  rating: null,
  ...over,
});

describe("percentile", () => {
  it("returns an observed value, not an interpolated one", () => {
    const v = [10, 20, 30, 40];
    expect(percentile(v, 50)).toBe(20);
    expect(percentile(v, 95)).toBe(40);
    expect(v).toEqual([10, 20, 30, 40]); // input not mutated
  });

  it("is null on no data rather than 0", () => {
    expect(percentile([], 95)).toBeNull();
  });

  it("handles a single sample", () => {
    expect(percentile([7], 95)).toBe(7);
  });
});

describe("summarise", () => {
  it("counts turns, conversations and users", () => {
    const s = summarise([
      turn(),
      turn({ conversationId: "c2" }),
      turn({ conversationId: "c2", userId: "u2" }),
    ]);
    expect(s.turns).toBe(3);
    expect(s.conversations).toBe(2);
    expect(s.users).toBe(2);
    expect(s.turnsPerConversation).toBe(1.5);
  });

  it("separates the failure modes and reports a combined rate", () => {
    const s = summarise([
      turn(),
      turn({ truncated: true, stopReason: "max_tokens" }),
      turn({ completed: false }),
      turn({ timedOut: true }),
    ]);
    expect(s.failures.truncated).toBe(1);
    expect(s.failures.incomplete).toBe(1);
    expect(s.failures.timedOut).toBe(1);
    expect(s.failures.anyRate).toBe(0.75);
  });

  it("counts scope refusals without counting them as failures", () => {
    const s = summarise([turn(), turn({ stopReason: "scope_refused" })]);
    expect(s.failures.scopeRefused).toBe(1);
    expect(s.failures.anyRate).toBe(0);
  });

  it("reports the negative rate over rated turns only", () => {
    const s = summarise([turn({ rating: 1 }), turn({ rating: -1 }), turn()]);
    expect(s.ratings).toMatchObject({ up: 1, down: 1, rated: 2, negativeRate: 0.5 });
  });

  it("is null, not zero, on a negative rate with nothing rated", () => {
    expect(summarise([turn()]).ratings.negativeRate).toBeNull();
  });

  it("totals cost per turn and per conversation", () => {
    const s = summarise([
      turn({ costMicroUsd: 1000 }),
      turn({ costMicroUsd: 3000 }),
      turn({ conversationId: "c2", costMicroUsd: 2000 }),
    ]);
    expect(s.cost.totalMicroUsd).toBe(6000);
    expect(s.cost.meanPerTurn).toBe(2000);
    expect(s.cost.meanPerConversation).toBe(3000);
  });

  it("tallies tool calls across turns", () => {
    const s = summarise([
      turn({ toolCalls: JSON.stringify(["search_course_content", "get_my_progress"]) }),
      turn({ toolCalls: JSON.stringify(["search_course_content"]) }),
      turn({ toolCalls: "not json" }),
    ]);
    expect(s.toolUse).toEqual({ search_course_content: 2, get_my_progress: 1 });
  });

  it("survives an empty window", () => {
    const s = summarise([]);
    expect(s.turns).toBe(0);
    expect(s.latency.ttftP95).toBeNull();
    expect(s.cost.meanPerTurn).toBe(0);
  });
});
