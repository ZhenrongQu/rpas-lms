/**
 * What the assistant actually did in production.
 *
 * Reads the AssistantTurn log and prints the numbers the audit could not answer:
 * failure rates by mode, cost per turn and per conversation, and P50/P95 latency.
 * Read-only, so it announces its target without demanding ALLOW_REMOTE_DB_WRITE —
 * pointing it at production is the normal way to use it.
 *
 *   pnpm assistant:stats            # last 30 days
 *   pnpm assistant:stats -- --days 7
 */
import { guardDbWrite } from "../src/lib/ops/dbTarget";
import { prisma } from "../src/lib/db";
import { summarise } from "../src/lib/agents/chat/stats";
import { formatUsd } from "../src/lib/agents/chat/cost";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ms = (x: number | null) => (x === null ? "—" : `${x} ms`);

async function main(): Promise<void> {
  guardDbWrite({ dryRun: true });

  const days = arg("days", 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.assistantTurn.findMany({
    where: { createdAt: { gte: since } },
    select: {
      conversationId: true,
      userId: true,
      model: true,
      stopReason: true,
      truncated: true,
      exhaustedSteps: true,
      timedOut: true,
      completed: true,
      toolCalls: true,
      costMicroUsd: true,
      ttftMs: true,
      totalMs: true,
      rating: true,
    },
  });

  const s = summarise(rows);
  const out: string[] = [];
  out.push(`\nAssistant — last ${days} days`);
  out.push("─".repeat(46));

  if (s.turns === 0) {
    out.push("No turns recorded in this window.");
    console.log(out.join("\n"));
    return;
  }

  out.push(`turns            ${s.turns}`);
  out.push(`conversations    ${s.conversations}  (${s.turnsPerConversation.toFixed(1)} turns each)`);
  out.push(`users            ${s.users}`);

  out.push(`\nFailure modes`);
  const f = s.failures;
  out.push(`  incomplete     ${f.incomplete}  (stream threw — student saw a half answer)`);
  out.push(`  truncated      ${f.truncated}  (max_tokens — answer cut off)`);
  out.push(`  step-exhausted ${f.exhaustedSteps}`);
  out.push(`  timed out      ${f.timedOut}`);
  out.push(`  any of these   ${pct(f.anyRate)}`);
  out.push(`  scope refused  ${f.scopeRefused}  (not a failure — the gate working)`);

  out.push(`\nStudent rating`);
  const r = s.ratings;
  out.push(
    r.rated === 0
      ? "  none yet — every failure rate above is self-assessed"
      : `  👍 ${r.up}   👎 ${r.down}   negative ${pct(r.negativeRate!)} of ${r.rated} rated`,
  );

  out.push(`\nCost`);
  out.push(`  total          ${formatUsd(s.cost.totalMicroUsd)}`);
  out.push(`  per turn       ${formatUsd(s.cost.meanPerTurn)}`);
  out.push(`  per conversation ${formatUsd(s.cost.meanPerConversation)}`);

  out.push(`\nLatency`);
  out.push(`  first token    p50 ${ms(s.latency.ttftP50)}   p95 ${ms(s.latency.ttftP95)}`);
  out.push(`  full answer    p50 ${ms(s.latency.totalP50)}   p95 ${ms(s.latency.totalP95)}`);

  const tools = Object.entries(s.toolUse).sort((a, b) => b[1] - a[1]);
  out.push(`\nTool calls`);
  out.push(tools.length === 0 ? "  none" : tools.map(([n, c]) => `  ${n.padEnd(22)} ${c}`).join("\n"));

  console.log(out.join("\n"));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
