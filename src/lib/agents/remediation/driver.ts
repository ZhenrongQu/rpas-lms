import type { RegressionFixture } from "./fixtures";
import { classifyOnLatestMain, reproduce } from "./reproduce";
import { transitionRun } from "./store";

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
