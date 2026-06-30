/**
 * SDLC agent CLI — the "team lead" entry point. Each subcommand is a fresh
 * process; approve/reject reload run state from the DB, which is exactly what
 * demonstrates the durable, resumable approval gate.
 *
 *   pnpm sdlc start "<idea>"          start a run; drafts the PRD, then pauses at its gate
 *   pnpm sdlc status <runId>          show status, current stage, and artifacts so far
 *   pnpm sdlc approve <runId> [note]  approve the current gate; resume to the next stage
 *   pnpm sdlc reject  <runId> [note]  reject the current gate; stop the run
 *   pnpm sdlc trace   <runId>         show the append-only step/gate trace (observability)
 */
import "../eval/loadEnv";
import type { AgentStep } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import { startRun, applyDecision, getRun } from "../../src/lib/agents/pipeline";

function usage(): never {
  console.error(
    [
      "Usage:",
      '  pnpm sdlc start "<idea>"',
      "  pnpm sdlc status <runId>",
      '  pnpm sdlc approve <runId> [note]',
      '  pnpm sdlc reject  <runId> [note]',
      "  pnpm sdlc trace   <runId>",
    ].join("\n"),
  );
  process.exit(1);
}

async function printRun(runId: string): Promise<void> {
  const run = await getRun(runId);
  if (!run) {
    console.error(`Run ${runId} not found.`);
    process.exit(1);
  }
  const artifacts = JSON.parse(run.artifacts) as Record<string, string>;

  console.log(`\nRun ${run.id}`);
  console.log(`  kind:         ${run.kind}`);
  console.log(`  status:       ${run.status}`);
  console.log(`  currentStage: ${run.currentStage ?? "-"}`);
  console.log(`  idea:         ${run.input}`);

  // Show the artifact at the current stage (the draft awaiting a decision), or
  // all artifacts when the run is finished.
  const focus = run.currentStage ?? Object.keys(artifacts).at(-1);
  if (focus && artifacts[focus]) {
    console.log(`\n──────── ${focus} ────────\n`);
    console.log(artifacts[focus]);
    console.log(`\n──────────────────────────`);
  }

  if (run.status === "awaiting_approval") {
    console.log(`\n⏸  Awaiting your decision at [${run.currentStage}]. To continue:`);
    console.log(`     pnpm sdlc approve ${run.id}`);
    console.log(`     pnpm sdlc reject  ${run.id} "reason"`);
  } else if (run.status === "done") {
    console.log(`\n✓ Run complete. Stages: ${Object.keys(artifacts).join(" → ")}`);
  } else if (run.status === "rejected") {
    console.log(`\n✗ Run rejected at [${run.currentStage}].`);
  }
  console.log();
}

async function printTrace(runId: string): Promise<void> {
  const run = await getRun(runId);
  if (!run) {
    console.error(`Run ${runId} not found.`);
    process.exit(1);
  }
  console.log(`\nTrace for run ${run.id} — status: ${run.status} (${run.steps.length} steps)\n`);
  run.steps.forEach((s, i) => {
    const out = s.output ? JSON.parse(s.output) : null;
    const summary =
      s.kind === "gate"
        ? `decision=${out?.action}${out?.note ? ` ("${out.note}")` : ""}`
        : `${typeof out === "string" ? out.length : 0} chars drafted`;
    const tok = s.tokens != null ? `${s.tokens} tok` : "—";
    console.log(
      `  ${String(i + 1).padStart(2)}. [${s.kind.padEnd(5)}] ${s.stage.padEnd(4)} ${tok.padStart(9)}  ${summary}`,
    );
  });
  console.log();
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);

  if ((cmd === "start" || cmd === "approve") && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (add it to .env). The agent needs it to draft.");
    process.exit(1);
  }

  switch (cmd) {
    case "start": {
      const idea = args.join(" ").trim();
      if (!idea) usage();
      console.log(`\n▶ Starting SDLC run for:\n  ${idea}`);
      const runId = await startRun(idea);
      await printRun(runId);
      break;
    }
    case "status": {
      const runId = args[0];
      if (!runId) usage();
      await printRun(runId);
      break;
    }
    case "trace": {
      const runId = args[0];
      if (!runId) usage();
      await printTrace(runId);
      break;
    }
    case "approve":
    case "reject": {
      const runId = args[0];
      if (!runId) usage();
      const note = args.slice(1).join(" ").trim() || undefined;
      await applyDecision(runId, cmd, note);
      console.log(`\n✓ ${cmd} applied to ${runId}.`);
      await printRun(runId);
      break;
    }
    default:
      usage();
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
