import type { RegressionFixture } from "./fixtures";
import { nodeStackStrategy, type FailureSignature } from "./signature";
import { scriptCheckRunner } from "./substrate";
import { runCheckAtCommit } from "./worktree";

const CHECK = "src/check.mjs";
const check = scriptCheckRunner(CHECK);

export type ReproductionResult =
  | { accepted: true; reason: "accepted"; signature: FailureSignature }
  | {
      accepted: false;
      reason: "control-failed" | "not-reproduced" | "signature-mismatch" | "unstable";
      signature?: FailureSignature;
    };

/**
 * Accept a reproduction only when (design §5.6): the known-good control passes,
 * the defective commit fails, the observed signature matches the incident, and the
 * failure is stable across `repeats` runs. The negative control is mandatory.
 */
export async function reproduce(
  fixture: RegressionFixture,
  opts: { repeats?: number } = {},
): Promise<ReproductionResult> {
  const repeats = opts.repeats ?? 3;
  const sig = nodeStackStrategy(fixture.incident);

  const control = await runCheckAtCommit(fixture.repoRoot, fixture.knownGoodCommit, check);
  if (control.exitCode !== 0) return { accepted: false, reason: "control-failed" };

  let signature: FailureSignature | null = null;
  for (let i = 0; i < repeats; i++) {
    const run = await runCheckAtCommit(fixture.repoRoot, fixture.defectiveCommit, check);
    if (run.exitCode === 0) return { accepted: false, reason: "not-reproduced" };
    const observed = sig.parse(run);
    if (!observed || sig.match(observed) !== "match") {
      return { accepted: false, reason: "signature-mismatch", signature: observed ?? undefined };
    }
    if (signature && sig.serialize(signature) !== sig.serialize(observed)) {
      return { accepted: false, reason: "unstable", signature: observed };
    }
    signature = observed;
  }
  return { accepted: true, reason: "accepted", signature: signature! };
}

export type Classification = "FIXING" | "ALREADY_FIXED" | "NEEDS_HUMAN";

/**
 * Classify the accepted defect against the latest-main tip (design §7): green ⇒
 * already fixed; still failing for the same reason ⇒ proceed to repair; failing
 * differently or no longer applying ⇒ needs a human.
 */
export async function classifyOnLatestMain(fixture: RegressionFixture): Promise<Classification> {
  const sig = nodeStackStrategy(fixture.incident);
  const run = await runCheckAtCommit(fixture.repoRoot, fixture.mainCommit, check);
  if (run.exitCode === 0) return "ALREADY_FIXED";
  const observed = sig.parse(run);
  if (observed && sig.match(observed) === "match") return "FIXING";
  return "NEEDS_HUMAN";
}
