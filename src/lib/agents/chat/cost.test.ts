import { describe, it, expect } from "vitest";
import { costMicroUsd, formatUsd } from "./cost";

const none = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

describe("costMicroUsd", () => {
  it("prices input and output at the model's list rate", () => {
    // Sonnet 4.6: $3/$15 per million. 1000 in = $0.003 = 3000 micro-USD.
    expect(costMicroUsd("claude-sonnet-4-6", { ...none, inputTokens: 1000 })).toBe(3000);
    expect(costMicroUsd("claude-sonnet-4-6", { ...none, outputTokens: 1000 })).toBe(15000);
  });

  it("discounts cache reads and surcharges cache writes", () => {
    expect(costMicroUsd("claude-sonnet-4-6", { ...none, cacheReadTokens: 1000 })).toBe(300);
    expect(costMicroUsd("claude-sonnet-4-6", { ...none, cacheWriteTokens: 1000 })).toBe(3750);
  });

  it("sums every component of a realistic turn", () => {
    const cost = costMicroUsd("claude-sonnet-4-6", {
      inputTokens: 1200,
      outputTokens: 400,
      cacheReadTokens: 2000,
      cacheWriteTokens: 800,
    });
    expect(cost).toBe(1200 * 3 + 400 * 15 + 2000 * 0.3 + 800 * 3.75);
  });

  // A zero would look like a free turn in every aggregate that matters.
  it("returns null for an unpriced model instead of reporting zero", () => {
    expect(costMicroUsd("some-future-model", { ...none, inputTokens: 10_000 })).toBeNull();
  });

  it("formats micro-USD as dollars", () => {
    expect(formatUsd(3000)).toBe("$0.0030");
    expect(formatUsd(1_000_000)).toBe("$1.0000");
  });
});
