/**
 * LLM Repairer eval — runs the real model over the graded catalog THROUGH the
 * deterministic kernel, so scoring is objective (a case is "fixed" only if it
 * reached PROPOSED, which requires green-after + the hidden holdout).
 *
 * Needs ANTHROPIC_API_KEY (loaded from .env). Writes to the DB, so it REFUSES to
 * run against anything but a local Postgres — point DATABASE_URL at the local test
 * DB, e.g.:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm eval:repair
 * Optional: REPAIR_EVAL_MODEL to override the default (claude-haiku-4-5).
 */
import "../eval/loadEnv";
import { prisma } from "../../src/lib/db";
import { createRepairCases, type RepairCase } from "../../src/lib/agents/remediation/llm/fixtures";
import { LlmRepairer } from "../../src/lib/agents/remediation/llm/repairer";
import { claimRun, createRemediationRun, ingestIncident, transitionRun } from "../../src/lib/agents/remediation/store";
import { driveRepair, driveReproduction } from "../../src/lib/agents/remediation/driver";

const WORKER = "repair-eval";
const LEASE_MS = 180_000;

function assertLocalDb(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error(
      `repair-eval refuses to run against a non-local DB. Set DATABASE_URL to the local test Postgres. Got: ${url.replace(/:[^:@/]*@/, ":***@") || "(unset)"}`,
    );
  }
}

type CaseResult = {
  id: string;
  category: string;
  expected: string;
  actual: string;
  pass: boolean;
  steps: number;
  tokens: number;
  ms: number;
};

async function evalCase(c: RepairCase, model?: string): Promise<CaseResult> {
  const started = Date.now();
  const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: c.incident.fingerprint, payload: {} });
  const run = await createRemediationRun(incident.id);
  await claimRun(run.id, WORKER, LEASE_MS);
  await transitionRun(run.id, WORKER, "RECEIVED", "TRIAGING");
  await transitionRun(run.id, WORKER, "TRIAGING", "CLASSIFIED");

  const repairer = new LlmRepairer(model ? { model } : {});
  let actual: string;
  try {
    const repro = await driveReproduction(run.id, WORKER, c, { repeats: 2 });
    actual = repro !== "FIXING" ? repro : await driveRepair(run.id, WORKER, c, repairer, { leaseMs: LEASE_MS, heartbeatMs: 15_000 });
  } catch (e) {
    actual = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  return {
    id: c.id,
    category: c.category,
    expected: c.expectedOutcome,
    actual,
    pass: actual === c.expectedOutcome,
    steps: repairer.steps.length,
    tokens: repairer.steps.reduce((s, x) => s + x.tokens, 0),
    ms: Date.now() - started,
  };
}

function report(results: CaseResult[]): void {
  console.log("\n  case                       category    expected      actual        pass  steps  tokens   ms");
  console.log("  " + "-".repeat(92));
  for (const r of results) {
    console.log(
      `  ${r.id.padEnd(26)} ${r.category.padEnd(11)} ${r.expected.padEnd(13)} ${r.actual.slice(0, 13).padEnd(13)} ${(r.pass ? "✓" : "✗").padEnd(4)} ${String(r.steps).padStart(5)} ${String(r.tokens).padStart(7)} ${String(r.ms).padStart(6)}`,
    );
  }

  const fixable = results.filter((r) => r.expected === "PROPOSED");
  const refusal = results.filter((r) => r.expected === "NEEDS_HUMAN");
  const wrongProposal = results.filter((r) => r.expected === "NEEDS_HUMAN" && r.actual === "PROPOSED");
  const rate = (n: number, d: number) => (d === 0 ? "n/a" : `${n}/${d} (${Math.round((100 * n) / d)}%)`);

  console.log("\n  summary");
  console.log(`    fix-rate (fixable → PROPOSED):        ${rate(fixable.filter((r) => r.pass).length, fixable.length)}`);
  console.log(`    refusal-correctness (→ NEEDS_HUMAN):  ${rate(refusal.filter((r) => r.pass).length, refusal.length)}`);
  console.log(`    SAFETY (no wrong PROPOSED):           ${wrongProposal.length === 0 ? "HELD ✓" : `BREACHED ✗ (${wrongProposal.map((r) => r.id).join(", ")})`}`);
  console.log(`    total tokens: ${results.reduce((s, r) => s + r.tokens, 0)}   total ms: ${results.reduce((s, r) => s + r.ms, 0)}\n`);
}

async function main(): Promise<void> {
  assertLocalDb();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("repair-eval needs ANTHROPIC_API_KEY (put it in .env)");
  const model = process.env.REPAIR_EVAL_MODEL;

  const cases = await createRepairCases();
  const fingerprints = cases.map((c) => c.incident.fingerprint);
  try {
    const results: CaseResult[] = [];
    for (const c of cases) results.push(await evalCase(c, model));
    report(results);
  } finally {
    await Promise.all(cases.map((c) => c.cleanup()));
    await prisma.incident.deleteMany({ where: { fingerprint: { in: fingerprints } } }); // cascade removes runs/proposals
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
