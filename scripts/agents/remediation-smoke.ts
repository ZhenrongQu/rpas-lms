import "../eval/loadEnv";
import { prisma } from "../../src/lib/db";
import { createRegressionFixture } from "../../src/lib/agents/remediation/fixtures";
import { claimRun, createRemediationRun, ingestIncident, transitionRun } from "../../src/lib/agents/remediation/store";
import { driveRepair, driveReproduction } from "../../src/lib/agents/remediation/driver";
import { fixtureRepairerFor } from "../../src/lib/agents/remediation/repair";

async function main(): Promise<void> {
  const fixture = await createRegressionFixture();
  try {
    const incident = await ingestIncident({
      repository: "generated-remediation-fixture",
      defaultBranch: "main",
      fingerprint: fixture.incident.fingerprint,
      payload: { ...fixture.incident, knownGoodCommit: fixture.knownGoodCommit, defectiveCommit: fixture.defectiveCommit, mainCommit: fixture.mainCommit },
    });
    const run = await createRemediationRun(incident.id);
    if (!(await claimRun(run.id, "smoke-worker", 60_000))) throw new Error("smoke worker failed to claim run");

    await transitionRun(run.id, "smoke-worker", "RECEIVED", "TRIAGING");
    await transitionRun(run.id, "smoke-worker", "TRIAGING", "CLASSIFIED");

    const reproOutcome = await driveReproduction(run.id, "smoke-worker", fixture);
    const repairOutcome =
      reproOutcome === "FIXING"
        ? await driveRepair(run.id, "smoke-worker", fixture, fixtureRepairerFor(fixture), { heartbeatMs: 1000 })
        : null;

    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    const action = await prisma.externalAction.findFirst({
      where: { incidentId: incident.id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    const patch = action?.versions[0]?.patch ?? null;

    console.log(
      JSON.stringify(
        {
          incidentId: incident.id,
          runId: run.id,
          cycle: run.cycle,
          reproOutcome,
          repairOutcome,
          phase: stored.phase,
          proposalPatchPreview: patch ? patch.split("\n").slice(0, 5) : null,
        },
        null,
        2,
      ),
    );
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
