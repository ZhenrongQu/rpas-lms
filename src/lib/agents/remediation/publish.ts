import { createHash, type KeyObject } from "node:crypto";
import { prisma } from "../../db";
import type { RepairEvidence } from "./fixAttempt";
import { verifyAttestation } from "./attestation";
import { verificationProfileFromTarget, type BlackBoxAttestation, type BlackBoxRequest } from "./types";

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
  opts: { knownKeys?: Map<string, KeyObject> } = {},
): Promise<{ actionId: string; version: number }> {
  const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId }, include: { incident: true } });
  if (run.phase !== "PROPOSING") throw new Error(`run ${runId} is not at PROPOSING (phase=${run.phase})`);
  if (run.leaseOwner !== workerId || !run.leaseExpiresAt || run.leaseExpiresAt <= new Date()) {
    throw new Error(`run ${runId} lost lease or CAS race`);
  }
  const evidence = JSON.parse(run.evidence ?? "null") as RepairEvidence | null;
  if (!evidence) throw new Error(`run ${runId} at PROPOSING has no evidence`);

  // Publish boundary (defense-in-depth; a kernel-wide invariant, not a driver-only
  // convention). Exactly two kinds of run may publish:
  //   • sandbox-fixture — the deterministic oracle self-test.
  //   • production-black-box — ONLY with a persisted attestation that RE-VERIFIES here
  //     (signature under the trust anchor + request bound to THIS patch). Re-verifying
  //     rather than trusting the phase means a run parked at PROPOSING via a direct
  //     transitionRun, or carrying a forged/foreign attestation, still cannot publish.
  // A missing / legacy / unknown profile is rejected (allowlist, not denylist).
  const profile = verificationProfileFromTarget(run.target);
  if (profile === "production-black-box") {
    const stored = (run.attestation ?? null) as { request?: BlackBoxRequest; attestation?: BlackBoxAttestation } | null;
    if (!stored?.request || !stored?.attestation) {
      throw new Error(`run ${runId} has no valid black-box attestation to publish`);
    }
    const verdict = verifyAttestation(stored.request, stored.attestation, opts.knownKeys ?? new Map());
    if (!verdict.ok) throw new Error(`run ${runId} black-box attestation failed re-verification at publish: ${verdict.reason}`);
    const patchSha = createHash("sha256").update(evidence.patch).digest("hex");
    if (stored.request.patchSha256 !== patchSha) {
      throw new Error(`run ${runId} black-box attestation is not bound to the patch being published`);
    }
  } else if (profile !== "sandbox-fixture") {
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
