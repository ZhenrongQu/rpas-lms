import { prisma } from "../../db";
import type { RepairEvidence } from "./fixAttempt";
import { verificationProfileFromTarget } from "./types";

const KIND = "draft_pr";

/** Review status of a published artifact:
 *   • `open`         — an APPROVED proposal (a sandbox-fixture self-test verified the fix).
 *   • `needs_review` — a candidate auto-fix from an UNTRUSTED author that passed local
 *                      heuristic gates but was NOT black-box attested; a human must review
 *                      it before it is trusted. Never conflated with an approved proposal. */
type ReviewStatus = "open" | "needs_review";

type IncidentRef = { id: string; repository: string; defaultBranch: string; fingerprint: string };

/**
 * Write (or idempotently re-write) the proposal artifact for a run's cycle at the given
 * review status. Shared by the approved-proposal and needs-review-draft paths. Idempotent
 * and concurrency-safe by construction — never catch-P2002-inside-a-transaction (that
 * aborts the PG tx): identity + version are created with `createMany({ skipDuplicates })`
 * (ON CONFLICT DO NOTHING) and the pointer is advanced with an atomic `GREATEST`, so a
 * replay of the same cycle is a silent no-op. `status` is authoritative from the UPDATE
 * (the create's status is ignored on a duplicate action).
 */
async function writeArtifact(
  inc: IncidentRef,
  cycle: number,
  body: string,
  patch: string,
  evidenceJson: string,
  status: ReviewStatus,
): Promise<{ actionId: string; version: number }> {
  await prisma.externalAction.createMany({
    data: [{ kind: KIND, incidentId: inc.id, repository: inc.repository, defaultBranch: inc.defaultBranch, fingerprint: inc.fingerprint, status }],
    skipDuplicates: true,
  });
  const action = await prisma.externalAction.findUniqueOrThrow({ where: { incidentId_kind: { incidentId: inc.id, kind: KIND } } });

  await prisma.externalActionVersion.createMany({
    data: [{ actionId: action.id, cycle, version: cycle, body, patch, evidence: evidenceJson }],
    skipDuplicates: true, // replay of the same cycle is a silent no-op
  });

  await prisma.$executeRaw`UPDATE "ExternalAction" SET "currentVersion" = GREATEST("currentVersion", ${cycle}), "status" = ${status} WHERE id = ${action.id}`;

  return { actionId: action.id, version: cycle };
}

/**
 * Publish (or supersede) the APPROVED remediation proposal for a run's cycle.
 *
 * Trust boundary: the caller supplies NO truthfulness material. The function reads the
 * run's own persisted, verified state and refuses unless the run is at `PROPOSING` and
 * `workerId` still holds the lease — so an errant/untrusted caller cannot forge a
 * "verified" proposal from an arbitrary phase. The patch and evidence are taken from
 * `run.evidence` (written atomically at FIXING), not from arguments.
 *
 * Publish boundary (defense-in-depth; enforced independently of the phase so a run parked
 * at PROPOSING via a direct transitionRun still cannot publish heuristic evidence): only a
 * sandbox-fixture self-test may publish an APPROVED proposal. A production-black-box run
 * needs an external black-box attestation the code under test cannot forge; no real
 * attestor exists yet, so it is refused here (it surfaces a needs-review draft instead —
 * see publishReviewDraft). A missing / legacy / unknown profile is refused too (allowlist).
 */
export async function publishProposal(runId: string, workerId: string): Promise<{ actionId: string; version: number }> {
  const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId }, include: { incident: true } });
  if (run.phase !== "PROPOSING") throw new Error(`run ${runId} is not at PROPOSING (phase=${run.phase})`);
  if (run.leaseOwner !== workerId || !run.leaseExpiresAt || run.leaseExpiresAt <= new Date()) {
    throw new Error(`run ${runId} lost lease or CAS race`);
  }
  const evidence = JSON.parse(run.evidence ?? "null") as RepairEvidence | null;
  if (!evidence) throw new Error(`run ${runId} at PROPOSING has no evidence`);

  const profile = verificationProfileFromTarget(run.target);
  if (profile !== "sandbox-fixture") {
    throw new Error(`run ${runId} requires a valid black-box attestation to publish (profile=${profile ?? "none"})`);
  }

  const body = `Automated remediation: reproduction went red→green. Files: ${evidence.changedFiles.join(", ")}`;
  return writeArtifact(run.incident, run.cycle, body, evidence.patch, run.evidence!, "open");
}

/**
 * Surface an UNTRUSTED author's candidate fix as a `needs_review` draft for a human.
 *
 * A production-black-box run passes the local heuristic gates but has no black-box
 * attestation (frozen — no real attestor yet), so it can never be AUTO-approved. Rather
 * than discard the candidate, we file its real patch as a review draft: the human gets a
 * reviewable artifact, and the run itself still fails closed to NEEDS_HUMAN. This is the
 * correct shape for an untrusted auto-fixer — it proposes, a human approves.
 *
 * Called from the VERIFYING dispatch (after `verify` passed) before the run transitions to
 * NEEDS_HUMAN; re-checks the green signal itself so a non-green candidate is never filed.
 */
export async function publishReviewDraft(runId: string, workerId: string): Promise<{ actionId: string; version: number }> {
  const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId }, include: { incident: true } });
  if (run.phase !== "VERIFYING") throw new Error(`run ${runId} is not at VERIFYING (phase=${run.phase})`);
  if (run.leaseOwner !== workerId || !run.leaseExpiresAt || run.leaseExpiresAt <= new Date()) {
    throw new Error(`run ${runId} lost lease or CAS race`);
  }
  const evidence = JSON.parse(run.evidence ?? "null") as RepairEvidence | null;
  if (!evidence) throw new Error(`run ${runId} at VERIFYING has no evidence`);

  // Only a production-black-box run produces a review draft; a sandbox-fixture run takes
  // the approved-proposal path instead. A missing / legacy / unknown profile is refused.
  const profile = verificationProfileFromTarget(run.target);
  if (profile !== "production-black-box") {
    throw new Error(`run ${runId} is not a production-black-box run (profile=${profile ?? "none"}); no review draft`);
  }
  // Self-contained green re-check: only surface a genuinely-green candidate for review,
  // independent of the driver having verified.
  if (!(evidence.greenAfter && evidence.holdoutPassed && evidence.reproductionIntact)) {
    throw new Error(`run ${runId} candidate did not pass local gates; nothing to surface for review`);
  }

  const body = `Candidate auto-fix awaiting HUMAN REVIEW — NOT auto-approved (no black-box attestation). Local gates: reproduction red→green, hidden holdout passed. Files: ${evidence.changedFiles.join(", ")}`;
  return writeArtifact(run.incident, run.cycle, body, evidence.patch, run.evidence!, "needs_review");
}
