/**
 * Turns the AssistantTurn log into the three numbers the audit could not answer:
 * where it fails and how often, what a turn costs, and what P95 latency is.
 *
 * Pure functions over rows, so the arithmetic is testable without a database and
 * the CLI stays a thin printer.
 */
export type TurnRow = {
  conversationId: string;
  userId: string;
  model: string;
  stopReason: string | null;
  truncated: boolean;
  exhaustedSteps: boolean;
  timedOut: boolean;
  completed: boolean;
  toolCalls: string;
  costMicroUsd: number | null;
  ttftMs: number | null;
  totalMs: number;
  rating: number | null;
};

/**
 * Nearest-rank percentile on a sorted copy. Nearest-rank, not interpolated,
 * because at the sample sizes this will see for months (tens to hundreds of
 * turns) an interpolated P95 invents a latency no request actually had. Returns
 * an observed value or null — never a synthetic one.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1]!;
}

export type Summary = {
  turns: number;
  conversations: number;
  users: number;
  /** Turns per conversation — how multi-turn the product actually is. */
  turnsPerConversation: number;
  failures: {
    incomplete: number; // the stream threw; the student saw a half answer
    truncated: number; // max_tokens: cut off mid-thought
    exhaustedSteps: number;
    timedOut: number;
    scopeRefused: number;
    /** Any of the above, per turn (a turn can trip more than one). */
    anyRate: number;
  };
  ratings: { up: number; down: number; rated: number; negativeRate: number | null };
  cost: { totalMicroUsd: number; meanPerTurn: number; meanPerConversation: number };
  latency: { ttftP50: number | null; ttftP95: number | null; totalP50: number | null; totalP95: number | null };
  toolUse: Record<string, number>;
};

export function summarise(rows: TurnRow[]): Summary {
  const turns = rows.length;
  const conversations = new Set(rows.map((r) => r.conversationId)).size;
  const rate = (n: number) => (turns === 0 ? 0 : n / turns);

  const incomplete = rows.filter((r) => !r.completed).length;
  const truncated = rows.filter((r) => r.truncated).length;
  const exhaustedSteps = rows.filter((r) => r.exhaustedSteps).length;
  const timedOut = rows.filter((r) => r.timedOut).length;
  const scopeRefused = rows.filter((r) => r.stopReason === "scope_refused").length;
  const anyBad = rows.filter(
    (r) => !r.completed || r.truncated || r.exhaustedSteps || r.timedOut,
  ).length;

  const up = rows.filter((r) => r.rating === 1).length;
  const down = rows.filter((r) => r.rating === -1).length;
  const rated = up + down;

  const totalMicroUsd = rows.reduce((sum, r) => sum + (r.costMicroUsd ?? 0), 0);

  const toolUse: Record<string, number> = {};
  for (const r of rows) {
    let names: string[] = [];
    try {
      names = JSON.parse(r.toolCalls) as string[];
    } catch {
      names = [];
    }
    for (const n of names) toolUse[n] = (toolUse[n] ?? 0) + 1;
  }

  const ttfts = rows.map((r) => r.ttftMs).filter((v): v is number => v !== null);
  const totals = rows.map((r) => r.totalMs).filter((v) => v > 0);

  return {
    turns,
    conversations,
    users: new Set(rows.map((r) => r.userId)).size,
    turnsPerConversation: conversations === 0 ? 0 : turns / conversations,
    failures: {
      incomplete,
      truncated,
      exhaustedSteps,
      timedOut,
      scopeRefused,
      anyRate: rate(anyBad),
    },
    ratings: { up, down, rated, negativeRate: rated === 0 ? null : down / rated },
    cost: {
      totalMicroUsd,
      meanPerTurn: turns === 0 ? 0 : totalMicroUsd / turns,
      meanPerConversation: conversations === 0 ? 0 : totalMicroUsd / conversations,
    },
    latency: {
      ttftP50: percentile(ttfts, 50),
      ttftP95: percentile(ttfts, 95),
      totalP50: percentile(totals, 50),
      totalP95: percentile(totals, 95),
    },
    toolUse,
  };
}
