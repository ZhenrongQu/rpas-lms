/**
 * Real-repo LLM repair eval: drives a REAL LlmRepairer + Docker isolation through
 * the deterministic kernel against the actual rpas-lms grade.ts defect.
 * `assertIsolatedForUntrusted` is called to enforce the production guard before
 * any model tokens are spent.
 *
 * Requirements:
 *   - Docker available (builds/reuses remediation-vitest image)
 *   - ANTHROPIC_API_KEY (loaded from .env)
 *   - Local test Postgres:
 *       DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm real-repair-eval
 *
 * Optional env: REAL_REPAIR_MODEL to override the default model (claude-haiku-4-5).
 */
import "../eval/loadEnv";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "../../src/lib/db";
import { ensureImage } from "../../src/lib/agents/remediation/isolated/dockerCheckRunner";
import { buildRealRepoFixture, gradeDedupDefect } from "../../src/lib/agents/remediation/real/fixture";
import { assertIsolatedForUntrusted } from "../../src/lib/agents/remediation/isolated/guard";
import { LlmRepairer } from "../../src/lib/agents/remediation/llm/repairer";
import {
  claimRun,
  createRemediationRun,
  ingestIncident,
  transitionRun,
} from "../../src/lib/agents/remediation/store";
import { driveRepair, driveReproduction } from "../../src/lib/agents/remediation/driver";

const execFileAsync = promisify(execFile);
const EVAL_REPO = `__real_repair_eval__:${randomUUID()}`;
const WORKER = "real-repair-eval";
const LEASE_MS = 300_000;

function assertLocalDb(): void {
  let host: string;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.replace(/^\[|\]$/g, "");
  } catch {
    throw new Error("real-repair-eval: DATABASE_URL is unset or unparseable; set it to the local test Postgres");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`real-repair-eval refuses a non-local DB (host: ${host}); set DATABASE_URL to the local test Postgres`);
  }
}

async function assertDockerAvailable(): Promise<void> {
  try {
    await execFileAsync("docker", ["version"], {});
  } catch {
    throw new Error("real-repair-eval requires Docker (docker version failed)");
  }
}

async function main(): Promise<void> {
  assertLocalDb();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("real-repair-eval needs ANTHROPIC_API_KEY");
  await assertDockerAvailable();

  const model = process.env.REAL_REPAIR_MODEL;

  // ── Build / reuse image ──────────────────────────────────────────────────────
  console.log("Building remediation image (cached if deps unchanged)…");
  const t0 = Date.now();
  const image = await ensureImage(process.cwd());
  console.log(`  image: ${image} (${Date.now() - t0}ms)\n`);

  // ── Build fixture ────────────────────────────────────────────────────────────
  console.log("Building grade-dedup defect fixture (Docker isolation)…");
  const fixture = await buildRealRepoFixture(gradeDedupDefect(process.cwd()), {
    isolation: "docker",
    image,
  });

  // ── Guard: enforce LLM ⇒ isolated runner ────────────────────────────────────
  const repairer = new LlmRepairer(model ? { model } : {});
  assertIsolatedForUntrusted(repairer, fixture); // throws if host runner is used
  console.log("Guard: assertIsolatedForUntrusted passed (docker substrate confirmed)\n");

  let incidentId: string | null = null;
  try {
    const incident = await ingestIncident({
      repository: EVAL_REPO,
      defaultBranch: "main",
      fingerprint: fixture.incident.fingerprint,
      payload: { ...fixture.incident, defectiveCommit: fixture.defectiveCommit },
    });
    incidentId = incident.id;
    const run = await createRemediationRun(incident.id);
    if (!(await claimRun(run.id, WORKER, LEASE_MS))) throw new Error("failed to claim run");
    await transitionRun(run.id, WORKER, "RECEIVED", "TRIAGING");
    await transitionRun(run.id, WORKER, "TRIAGING", "CLASSIFIED");

    // ── Run ──────────────────────────────────────────────────────────────────
    const t1 = Date.now();
    console.log("driveReproduction…");
    const reproOutcome = await driveReproduction(run.id, WORKER, fixture, { repeats: 2 });
    console.log(`  → ${reproOutcome} (${Date.now() - t1}ms)\n`);

    let repairOutcome: string | null = null;
    if (reproOutcome === "FIXING") {
      console.log("driveRepair (LlmRepairer + Docker)…");
      const t2 = Date.now();
      repairOutcome = await driveRepair(run.id, WORKER, fixture, repairer, {
        leaseMs: LEASE_MS,
        heartbeatMs: 15_000,
      });
      console.log(`  → ${repairOutcome} (${Date.now() - t2}ms)\n`);
    }
    const totalMs = Date.now() - t1;

    // ── Read stored evidence ──────────────────────────────────────────────────
    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    const ev = stored.evidence ? (JSON.parse(stored.evidence) as Record<string, unknown>) : null;
    const action = await prisma.externalAction.findFirst({
      where: { incidentId: incident.id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    const patch = action?.versions[0]?.patch ?? null;

    // ── Print trace ───────────────────────────────────────────────────────────
    if (repairer.steps.length > 0) {
      console.log("Repair trace:");
      for (const [i, step] of repairer.steps.entries()) {
        const toolSummary = step.tools.map((t) => `${t.name}(${t.status})`).join(", ");
        console.log(`  step ${i + 1}: tokens=${step.tokens}  tools=[${toolSummary || "none"}]`);
      }
      const totalTokens = repairer.steps.reduce((s, x) => s + x.tokens, 0);
      console.log(`  total tokens: ${totalTokens}\n`);
    }

    // ── Result ────────────────────────────────────────────────────────────────
    const proposed = stored.phase === "PROPOSED";
    console.log("─────────────────────────────────────────────────────────");
    console.log(`defect:       src/lib/exam/grade.ts (grade-dedup)`);
    console.log(`substrate:    real vitest + Docker isolation`);
    console.log(`model:        ${model ?? "claude-haiku-4-5 (default)"}`);
    console.log(`reproOutcome: ${reproOutcome}`);
    console.log(`repairOutcome:${repairOutcome ?? "n/a"}`);
    console.log(`phase:        ${stored.phase}`);
    if (ev) {
      console.log(`gates:        redBeforeMatches=${ev.redBeforeMatches} greenAfter=${ev.greenAfter} holdout=${ev.holdoutPassed} intact=${ev.reproductionIntact}`);
    }
    if (patch) {
      console.log(`\npatch preview:\n${patch.split("\n").slice(0, 12).join("\n")}`);
    }
    console.log(`\ntotal time:   ${totalMs}ms`);
    console.log(`result:       ${proposed ? "PASS ✓ (PROPOSED)" : "FAIL ✗ (" + stored.phase + ")"}`);

    if (!proposed) process.exitCode = 1;
  } finally {
    await fixture.cleanup();
    if (incidentId) await prisma.incident.deleteMany({ where: { id: incidentId } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
