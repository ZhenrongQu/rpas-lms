import { prisma } from "../../db";
import type { RegressionFixture } from "./fixtures";
import { runFixAttempt, type RepairEvidence } from "./fixAttempt";
import { publishProposal } from "./publish";
import { classifyOnLatestMain, reproduce } from "./reproduce";
import type { Repairer, RepairPolicy } from "./repair";
import { freezeRunPolicy, heartbeatRun, transitionRun, transitionRunWithEvidence } from "./store";
import { verify, type VerifyPolicy } from "./verify";

/** The repair+verify rules frozen per run so a resume can never use different ones. */
type FrozenPolicy = { verify: VerifyPolicy; repair: RepairPolicy };

export type ReproductionOutcome = "FIXING" | "ALREADY_FIXED" | "NOT_REPRODUCIBLE" | "NEEDS_HUMAN";

/**
 * Advance a CLASSIFIED run through reproduction to exactly one outcome, moving the
 * phase only through the lease-guarded transitionRun (so lease/CAS invariants are
 * reused, never re-implemented). A signature mismatch is a human call; a broken
 * control / non-reproduction / instability is NOT_REPRODUCIBLE.
 */
export async function driveReproduction(
  runId: string,
  workerId: string,
  fixture: RegressionFixture,
  opts: { repeats?: number } = {},
): Promise<ReproductionOutcome> {
  await transitionRun(runId, workerId, "CLASSIFIED", "REPRODUCING");

  const rep = await reproduce(fixture, opts);
  const outcome: ReproductionOutcome = !rep.accepted
    ? rep.reason === "signature-mismatch"
      ? "NEEDS_HUMAN"
      : "NOT_REPRODUCIBLE"
    : await classifyOnLatestMain(fixture);

  await transitionRun(runId, workerId, "REPRODUCING", outcome);
  return outcome;
}

export type RepairOutcome = "PROPOSED" | "NEEDS_HUMAN";

export type DriveRepairOptions = {
  leaseMs?: number;
  heartbeatMs?: number;
  maxPatchBytes?: number;
  /** test-only: override the heartbeat beat / tamper the worktree. */
  _beat?: () => Promise<boolean>;
  _tamperCheckAfterRepair?: (worktreeRoot: string) => Promise<void>;
};

/**
 * Resumable repair driver: dispatches on the run's CURRENT phase, so a crash at
 * any point resumes without redoing prior work.
 *   FIXING     → run the attempt, persist evidence atomically with → VERIFYING
 *   VERIFYING  → verify persisted evidence → PROPOSING (ok) or NEEDS_HUMAN
 *   PROPOSING  → idempotently publish → PROPOSED
 * A LeaseLost/exception leaves the phase un-advanced (re-invoke resumes).
 */
export async function driveRepair(
  runId: string,
  workerId: string,
  fixture: RegressionFixture,
  repairer: Repairer,
  opts: DriveRepairOptions = {},
): Promise<RepairOutcome> {
  const leaseMs = opts.leaseMs ?? 60_000;
  // Policy derived from args only the FIRST time; then frozen on the run so a
  // resume verifies under identical rules regardless of later caller args.
  const argsPolicy: FrozenPolicy = {
    verify: {
      allowedPaths: [fixture.sourceRelPath],
      maxFiles: 5,
      maxDiffLines: 200,
      maxPatchBytes: opts.maxPatchBytes ?? 1_000_000,
    },
    repair: { allowedPaths: [fixture.sourceRelPath], pinnedPaths: ["src/check.mjs"] },
  };

  for (;;) {
    // Fail fast if we no longer own the lease — BEFORE any expensive worktree work
    // (a wrong worker must not run the whole fix and only lose at commit time).
    // This also renews the lease across the fast VERIFYING/PROPOSING phases.
    if (!(await heartbeatRun(runId, workerId, leaseMs))) {
      throw new Error(`run ${runId} lost lease or CAS race`);
    }
    const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
    const policy = await freezeRunPolicy(runId, workerId, run.policy, argsPolicy);

    switch (run.phase) {
      case "FIXING": {
        const evidence = await runFixAttempt(fixture, repairer, {
          policy: policy.repair,
          maxPatchBytes: policy.verify.maxPatchBytes,
          heartbeat: {
            intervalMs: opts.heartbeatMs ?? 5_000,
            beat: opts._beat ?? (() => heartbeatRun(runId, workerId, leaseMs)),
          },
          _tamperCheckAfterRepair: opts._tamperCheckAfterRepair,
        });
        await transitionRunWithEvidence(runId, workerId, "FIXING", "VERIFYING", JSON.stringify(evidence));
        break;
      }
      case "VERIFYING": {
        const evidence = JSON.parse(run.evidence ?? "null") as RepairEvidence | null;
        if (!evidence) throw new Error(`run ${runId} at VERIFYING has no evidence`);
        const verdict = verify(evidence, policy.verify);
        if (!verdict.ok) {
          await transitionRun(runId, workerId, "VERIFYING", "NEEDS_HUMAN");
          return "NEEDS_HUMAN";
        }
        await transitionRun(runId, workerId, "VERIFYING", "PROPOSING");
        break;
      }
      case "PROPOSING": {
        // publishProposal reads the run's own persisted evidence + enforces the
        // lease; the driver injects no truthfulness material.
        await publishProposal(runId, workerId);
        await transitionRun(runId, workerId, "PROPOSING", "PROPOSED");
        return "PROPOSED";
      }
      default:
        throw new Error(`driveRepair cannot run from phase ${run.phase}`);
    }
  }
}
