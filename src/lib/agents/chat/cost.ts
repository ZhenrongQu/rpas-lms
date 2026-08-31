/**
 * Token usage → money.
 *
 * Stored as integer MICRO-USD (1e-6 dollars), never a float: a turn costs on the
 * order of a tenth of a cent, and summing thousands of binary fractions to answer
 * "what did last month cost" is how you get an answer that is wrong in the third
 * decimal and impossible to reconcile against an invoice.
 *
 * The unit also makes the arithmetic exact. List prices are dollars per million
 * tokens, so cost in micro-USD is simply `tokens × dollarsPerMillion` — no
 * division, no rounding until the very end.
 *
 * Prices are per-model and must be updated when the model changes; an unknown
 * model returns null rather than silently costing zero, because a zero would
 * quietly under-report the thing this exists to report.
 */
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** Dollars per million tokens, per Anthropic's published list prices. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

// Cache reads bill at ~0.1x the input rate; writes at ~1.25x.
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export function costMicroUsd(model: string, u: Usage): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return Math.round(
    u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheReadTokens * p.input * CACHE_READ_MULTIPLIER +
      u.cacheWriteTokens * p.input * CACHE_WRITE_MULTIPLIER,
  );
}

/** For logs and dashboards: micro-USD → a human "$0.0123". */
export function formatUsd(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(4)}`;
}
