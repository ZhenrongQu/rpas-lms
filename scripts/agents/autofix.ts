/**
 * Auto-fix runner — the remediation link after triage. Given a triage ticket, it
 * runs a fix agent inside an ISOLATED git worktree, captures the resulting diff,
 * and presents it as a DRAFT for human review. It does NOT commit, push, or merge,
 * and refuses P0 issues (those need a human).
 *
 *   pnpm autofix <ticketKey>     (needs ANTHROPIC_API_KEY)
 *
 * In production this would auto-spawn from triage for eligible severities and open
 * a real draft PR; here it's command-triggered and the PR is mocked.
 */
import "../eval/loadEnv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../../src/lib/db";
import { runFix } from "../../src/lib/agents/autofix/fix";
import { recordStep } from "../../src/lib/agents/trace";
import type { TriageDecision } from "../../src/lib/agents/triage/schema";

const execFileAsync = promisify(execFile);
const git = (args: string[]) =>
  execFileAsync("git", args, { cwd: process.cwd(), maxBuffer: 50 * 1024 * 1024 });

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (add it to .env).");
    process.exit(1);
  }
  const ticketKey = process.argv[2];
  if (!ticketKey) {
    console.error("Usage: pnpm autofix <ticketKey>");
    process.exit(1);
  }

  // Resolve ticket → triage run → decision.
  const ticket = await prisma.mockTicket.findUnique({ where: { key: ticketKey } });
  if (!ticket?.runId) {
    console.error(`Ticket ${ticketKey} not found, or has no source run.`);
    process.exit(1);
  }
  const triageRun = await prisma.agentRun.findUnique({ where: { id: ticket.runId } });
  const decision: TriageDecision | undefined = triageRun
    ? JSON.parse(triageRun.artifacts).decision
    : undefined;
  if (!decision) {
    console.error(`No triage decision found for ${ticketKey} (is it an auto-filed triage ticket?).`);
    process.exit(1);
  }

  // Eligibility gate: never auto-fix a P0 — that needs a human.
  if (decision.severity === "P0") {
    console.error(`${ticketKey} is P0 — auto-fix refuses. Escalate to a human.`);
    process.exit(1);
  }

  const ts = Date.now();
  const branch = `autofix/${ticketKey}-${ts}`;
  const wt = join(tmpdir(), `autofix-${ticketKey}-${ts}`);

  console.log(`\n▶ Auto-fix ${ticketKey} [${decision.severity}] — ${decision.summary}`);
  console.log(`  worktree: ${wt}`);
  console.log(`  branch:   ${branch}\n`);

  const run = await prisma.agentRun.create({
    data: { kind: "auto-fix", input: `${ticketKey}: ${decision.summary}`, status: "running", artifacts: "{}" },
  });

  let diff = "";
  try {
    await git(["worktree", "add", "-b", branch, wt, "HEAD"]);
    try {
      const { summary, tokens } = await runFix(decision, wt);
      await recordStep(run.id, "fix", "stage", { summary }, tokens);
      console.log(`Fix agent: ${summary}\n`);
      await git(["-C", wt, "add", "-A"]);
      diff = (await git(["-C", wt, "diff", "--cached"])).stdout;
    } finally {
      // Tear down the isolated copy — nothing here is kept.
      await git(["worktree", "remove", "--force", wt]).catch(() => {});
      await git(["branch", "-D", branch]).catch(() => {});
    }
  } catch (e) {
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "failed" } }).catch(() => {});
    console.error(`auto-fix failed: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
    return;
  }

  if (!diff.trim()) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "failed", artifacts: JSON.stringify({ note: "no changes produced" }) },
    });
    console.log("No changes were produced.");
    return;
  }

  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: "done", artifacts: JSON.stringify({ diff, ticket: ticketKey }) },
  });

  console.log("──────── proposed patch ────────\n");
  console.log(diff);
  console.log("────────────────────────────────\n");
  console.log("⏸  DRAFT — not committed, not pushed, not merged. (mock) Would open a draft PR:");
  console.log(`     title: [autofix] ${decision.summary}`);
  console.log(`     base:  feat/sdlc-agent   head: ${branch}`);
  console.log(`     body:  Fixes ${ticketKey}. ${decision.rationale}`);
  console.log(`     (real flow: git push + gh pr create --draft)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
