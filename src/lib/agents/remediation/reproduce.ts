import type { RegressionFixture } from "./fixtures";
import { expectCompleted } from "./substrate";
import { runCheckAtCommit } from "./worktree";

export type ReproductionResult =
  | { accepted: true; reason: "accepted"; signature: unknown }
  | {
      accepted: false;
      reason: "control-failed" | "not-reproduced" | "signature-mismatch" | "unstable";
      signature?: unknown;
    };

/**
 * Accept a reproduction only when (design §5.6): the known-good control passes,
 * the defective commit fails, the observed signature matches the incident, and the
 * failure is stable across `repeats` runs. The negative control is mandatory.
 */
export async function reproduce(
  fixture: RegressionFixture,
  opts: { repeats?: number; signal?: AbortSignal } = {},
): Promise<ReproductionResult> {
  const repeats = opts.repeats ?? 3;
  const { runCheck, signature: sig } = fixture.substrate;

  const control = expectCompleted(await runCheckAtCommit(fixture.repoRoot, fixture.knownGoodCommit, runCheck, opts.signal));
  if (control.exitCode !== 0) return { accepted: false, reason: "control-failed" };

  let signature: unknown = null;
  for (let i = 0; i < repeats; i++) {
    const run = expectCompleted(await runCheckAtCommit(fixture.repoRoot, fixture.defectiveCommit, runCheck, opts.signal));
    if (run.exitCode === 0) return { accepted: false, reason: "not-reproduced" };
    const observed = sig.parse(run);
    if (observed == null || sig.match(observed) !== "match") {
      return { accepted: false, reason: "signature-mismatch", signature: observed ?? undefined };
    }
    if (signature != null && sig.serialize(signature) !== sig.serialize(observed)) {
      return { accepted: false, reason: "unstable", signature: observed };
    }
    signature = observed;
  }
  return { accepted: true, reason: "accepted", signature };
}

export type Classification = "FIXING" | "ALREADY_FIXED" | "NEEDS_HUMAN";

/**
 * Classify the accepted defect against the latest-main tip (design §7): green ⇒
 * already fixed; still failing for the same reason ⇒ proceed to repair; failing
 * differently or no longer applying ⇒ needs a human.
 */
export async function classifyOnLatestMain(
  fixture: RegressionFixture,
  opts: { signal?: AbortSignal } = {},
): Promise<Classification> {
  const { runCheck, signature: sig } = fixture.substrate;
  const run = expectCompleted(await runCheckAtCommit(fixture.repoRoot, fixture.mainCommit, runCheck, opts.signal));
  if (run.exitCode === 0) return "ALREADY_FIXED";
  const observed = sig.parse(run);
  if (observed != null && sig.match(observed) === "match") return "FIXING";
  return "NEEDS_HUMAN";
}
