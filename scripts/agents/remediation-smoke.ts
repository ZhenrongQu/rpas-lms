import "../eval/loadEnv";
import { prisma } from "../../src/lib/db";
import { createRegressionFixture } from "../../src/lib/agents/remediation/fixtures";
import { claimRun, ingestIncident, transitionRun } from "../../src/lib/agents/remediation/store";
import { driveReproduction } from "../../src/lib/agents/remediation/driver";

async function main(): Promise<void> {
  const fixture = await createRegressionFixture();
  try {
    const incident = await ingestIncident({
      repository: "generated-remediation-fixture",
      defaultBranch: "main",
      fingerprint: fixture.incident.fingerprint,
      payload: {
        ...fixture.incident,
        knownGoodCommit: fixture.knownGoodCommit,
        defectiveCommit: fixture.defectiveCommit,
        mainCommit: fixture.mainCommit,
      },
    });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });
    if (!(await claimRun(run.id, "smoke-worker", 60_000))) throw new Error("smoke worker failed to claim run");

    await transitionRun(run.id, "smoke-worker", "RECEIVED", "TRIAGING");
    await transitionRun(run.id, "smoke-worker", "TRIAGING", "CLASSIFIED");

    const outcome = await driveReproduction(run.id, "smoke-worker", fixture);
    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });

    console.log(JSON.stringify({
      incidentId: incident.id,
      runId: run.id,
      outcome,
      phase: stored.phase,
      knownGoodCommit: fixture.knownGoodCommit,
      defectiveCommit: fixture.defectiveCommit,
    }));
  } finally {
    await fixture.cleanup();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
