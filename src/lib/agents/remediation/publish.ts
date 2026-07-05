import { prisma } from "../../db";
import type { RepairEvidence } from "./fixAttempt";
import { verificationProfileFromTarget } from "./types";

const KIND = "draft_pr";

/**
 * Publish (or supersede) the remediation proposal for a run's cycle.
 *
 * Trust boundary: the caller supplies NO truthfulness material. The function
 * reads the run's own persisted, verified state and refuses unless the run is at
 * `PROPOSING` and `workerId` still holds the lease — so an errant/untrusted
 * caller cannot forge a "verified" proposal from an arbitrary phase. The patch
 * and evidence are taken from `run.evidence` (written atomically at FIXING), not
 * from arguments.
 *
 * Idempotent and concurrency-safe by construction — never
 * catch-P2002-inside-a-transaction (that aborts the PG tx): identity and version
 * are created with `createMany({ skipDuplicates })` (ON CONFLICT DO NOTHING), and
 * the pointer is advanced with an atomic `GREATEST`. The phase/lease check is a
 * check-then-act, but the exclusive lease (only one owner) plus this idempotency
 * make a race benign.
 */
export async function publishProposal(
  runId: string,
  workerId: string,
): Promise<{ actionId: string; version: number }> {
  const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId }, include: { incident: true } });
  if (run.phase !== "PROPOSING") throw new Error(`run ${runId} is not at PROPOSING (phase=${run.phase})`);
  if (run.leaseOwner !== workerId || !run.leaseExpiresAt || run.leaseExpiresAt <= new Date()) {
    throw new Error(`run ${runId} lost lease or CAS race`);
  }
  const evidence = JSON.parse(run.evidence ?? "null") as RepairEvidence | null;
  if (!evidence) throw new Error(`run ${runId} at PROPOSING has no evidence`);

  // Publish boundary (defense-in-depth; a kernel-wide invariant, not a driver-only
  // convention), enforced independently of the phase so a run parked at PROPOSING via a
  // direct transitionRun still cannot publish heuristic evidence. Only a sandbox-fixture
  // self-test may publish. A production-black-box run needs an external black-box
  // attestation the code under test cannot forge; no real attestor exists yet, so it is
  // refused here. A missing / legacy / unknown profile is refused too (allowlist).
  const profile = verificationProfileFromTarget(run.target);
  if (profile !== "sandbox-fixture") {
    throw new Error(`run ${runId} requires a valid black-box attestation to publish (profile=${profile ?? "none"})`);
  }

  const inc = run.incident;
  const body = `Automated remediation: reproduction went red→green. Files: ${evidence.changedFiles.join(", ")}`;

  await prisma.externalAction.createMany({
    data: [
      {
        kind: KIND,
        incidentId: inc.id,
        repository: inc.repository,
        defaultBranch: inc.defaultBranch,
        fingerprint: inc.fingerprint,
      },
    ],
    skipDuplicates: true,
  });
  const action = await prisma.externalAction.findUniqueOrThrow({
    where: { incidentId_kind: { incidentId: inc.id, kind: KIND } },
  });

  await prisma.externalActionVersion.createMany({
    data: [{ actionId: action.id, cycle: run.cycle, version: run.cycle, body, patch: evidence.patch, evidence: run.evidence! }],
    skipDuplicates: true, // replay of the same cycle is a silent no-op
  });

  await prisma.$executeRaw`UPDATE "ExternalAction" SET "currentVersion" = GREATEST("currentVersion", ${run.cycle}), "status" = 'open' WHERE id = ${action.id}`;

  return { actionId: action.id, version: run.cycle };
}
