/**
 * Real-repo adapter smoke: drive a REAL rpas-lms defect (a synthesized mutation of
 * src/lib/exam/grade.ts) through the deterministic kernel using the REAL vitest
 * toolchain — reproduce (real `vitest run grade.test.ts`, red/green + signature +
 * stability) → classify → repair (oracle FixtureRepairer) → verify → PROPOSED with a
 * real patch. Proves the same kernel + Repairer drive a real substrate unchanged.
 *
 * Writes to the kernel DB, so it REFUSES a non-local DB — point DATABASE_URL at the
 * local test Postgres:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm remediation:real-smoke
 */
import "../eval/loadEnv";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/db";
import { buildRealRepoFixture, gradeDedupDefect } from "../../src/lib/agents/remediation/real/fixture";
import { claimRun, createRemediationRun, ingestIncident, transitionRun } from "../../src/lib/agents/remediation/store";
import { driveRepair, driveReproduction } from "../../src/lib/agents/remediation/driver";
import { fixtureRepairerFor } from "../../src/lib/agents/remediation/repair";

const WORKER = "real-smoke";
// A per-run-unique namespace so the smoke never upserts onto / deletes a real incident.
const SMOKE_REPO = `__real_repo_smoke__:${randomUUID()}`;

function assertLocalDb(): void {
  let host: string;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.replace(/^\[|\]$/g, "");
  } catch {
    throw new Error("remediation-real-smoke: DATABASE_URL is unset or unparseable; set it to the local test Postgres");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`remediation-real-smoke refuses a non-local DB (host: ${host}); set DATABASE_URL to the local test Postgres`);
  }
}

async function main(): Promise<void> {
  assertLocalDb();
  const t0 = Date.now();
  // Trusted deterministic oracle self-test → sandbox-fixture (may reach PROPOSED).
  const fixture = await buildRealRepoFixture(gradeDedupDefect(process.cwd()), { verificationProfile: "sandbox-fixture" });
  const tBuilt = Date.now();
  let incidentId: string | null = null;
  try {
    const incident = await ingestIncident({
      repository: SMOKE_REPO,
      defaultBranch: "main",
      fingerprint: fixture.incident.fingerprint,
      payload: { ...fixture.incident, defectiveCommit: fixture.defectiveCommit },
    });
    incidentId = incident.id;
    const run = await createRemediationRun(incident.id);
    if (!(await claimRun(run.id, WORKER, 120_000))) throw new Error("smoke worker failed to claim run");
    await transitionRun(run.id, WORKER, "RECEIVED", "TRIAGING");
    await transitionRun(run.id, WORKER, "TRIAGING", "CLASSIFIED");

    const tRepro0 = Date.now();
    const reproOutcome = await driveReproduction(run.id, WORKER, fixture, { repeats: 2 });
    const tRepro1 = Date.now();
    const repairOutcome =
      reproOutcome === "FIXING"
        ? await driveRepair(run.id, WORKER, fixture, fixtureRepairerFor(fixture), { leaseMs: 120_000, heartbeatMs: 5_000 })
        : null;
    const tRepair1 = Date.now();

    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    const ev = stored.evidence ? (JSON.parse(stored.evidence) as Record<string, unknown>) : null;
    const action = await prisma.externalAction.findFirst({
      where: { incidentId: incident.id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    const patch = action?.versions[0]?.patch ?? null;

    console.log(
      JSON.stringify(
        {
          substrate: "real vitest (src/lib/exam/grade.ts)",
          reproOutcome,
          repairOutcome,
          phase: stored.phase,
          gates: ev && {
            redBeforeMatches: ev.redBeforeMatches,
            greenAfter: ev.greenAfter,
            holdoutPassed: ev.holdoutPassed,
            reproductionIntact: ev.reproductionIntact,
            changedFiles: ev.changedFiles,
          },
          proposalPatchPreview: patch ? patch.split("\n").slice(0, 8) : null,
          timingMs: { clone: tBuilt - t0, reproduce: tRepro1 - tRepro0, repair: tRepair1 - tRepro1, total: tRepair1 - t0 },
        },
        null,
        2,
      ),
    );
    if (stored.phase !== "PROPOSED") process.exitCode = 1;
  } finally {
    await fixture.cleanup();
    if (incidentId) await prisma.incident.deleteMany({ where: { id: incidentId } }); // cascade removes run/proposal
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
