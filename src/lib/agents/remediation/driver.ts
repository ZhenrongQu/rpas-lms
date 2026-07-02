import { prisma } from "../../db";
import type { RegressionFixture } from "./fixtures";
import { runFixAttempt, type RepairEvidence } from "./fixAttempt";
import { publishProposal } from "./publish";
import { classifyOnLatestMain, reproduce } from "./reproduce";
import type { Repairer, RepairPolicy } from "./repair";
import { freezeRunPolicy, heartbeatRun, transitionRun, transitionRunWithEvidence } from "./store";
import { verify, type VerifyPolicy } from "./verify";
import type { RemediationPhase } from "./types";

/** The caller-supplied identity of the code state being repaired. Frozen on the
 *  run so a resume cannot be pointed at a DIFFERENT fixture/commit than the one
 *  that was triaged and reproduced. */
type RepairTarget = {
  fingerprint: string;
  mainCommit: string;
  defectiveCommit: string;
  knownGoodCommit: string;
  sourceRelPath: string;
};

/** The repair/verify rules + target frozen per run so a resume can never use
 *  different ones. */
type FrozenSpec = { verify: VerifyPolicy; repair: RepairPolicy; target: RepairTarget };

const REPAIRABLE_PHASES = new Set(["FIXING", "VERIFYING", "PROPOSING"]);

function targetOf(fixture: RegressionFixture): RepairTarget {
  return {
    fingerprint: fixture.incident.fingerprint,
    mainCommit: fixture.mainCommit,
    defectiveCommit: fixture.defectiveCommit,
    knownGoodCommit: fixture.knownGoodCommit,
    sourceRelPath: fixture.sourceRelPath,
  };
}

function sameTarget(a: RepairTarget, b: RepairTarget): boolean {
  return (
    a.fingerprint === b.fingerprint &&
    a.mainCommit === b.mainCommit &&
    a.defectiveCommit === b.defectiveCommit &&
    a.knownGoodCommit === b.knownGoodCommit &&
    a.sourceRelPath === b.sourceRelPath
  );
}

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
  const target = targetOf(fixture);
  // Spec derived from args only the FIRST time; then frozen on the run so a resume
  // runs under identical rules AND against the same target regardless of args.
  const argsSpec: FrozenSpec = {
    verify: {
      allowedPaths: [fixture.sourceRelPath],
      maxFiles: 5,
      maxDiffLines: 200,
      maxPatchBytes: opts.maxPatchBytes ?? 1_000_000,
    },
    repair: { allowedPaths: [fixture.sourceRelPath], pinnedPaths: ["src/check.mjs"] },
    target,
  };

  for (;;) {
    // Fail fast if we no longer own the lease — BEFORE any expensive worktree work
    // (a wrong worker must not run the whole fix and only lose at commit time).
    // This also renews the lease across the fast VERIFYING/PROPOSING phases.
    if (!(await heartbeatRun(runId, workerId, leaseMs))) {
      throw new Error(`run ${runId} lost lease or CAS race`);
    }
    const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
    // Validate the phase BEFORE freezing, so an accidental call from a non-repair
    // phase cannot persist a policy and pollute a later real repair.
    if (!REPAIRABLE_PHASES.has(run.phase)) {
      throw new Error(`driveRepair cannot run from phase ${run.phase}`);
    }
    const spec = await freezeRunPolicy(runId, workerId, run.policy, argsSpec);
    // The caller must hand us the SAME target that was frozen; a mismatch means
    // this resume is pointed at a different fixture/commit than was reproduced —
    // escalate rather than verify a self-consistent but wrong repair.
    if (!sameTarget(target, spec.target)) {
      await transitionRun(runId, workerId, run.phase as RemediationPhase, "NEEDS_HUMAN");
      return "NEEDS_HUMAN";
    }
    const policy = spec;

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
