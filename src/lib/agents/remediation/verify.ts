import type { RepairEvidence } from "./fixAttempt";

/**
 * Deterministic verification (design §5.8) — pure, no I/O. Turns a fix-attempt
 * evidence bundle into a verdict by an ordered list of gates; collects every
 * failing gate id. An LLM may summarise this, never override it.
 */
export type VerifyPolicy = {
  allowedPaths: string[];
  maxFiles: number;
  maxDiffLines: number;
  maxPatchBytes: number;
};

export type Verdict = { ok: boolean; failures: string[] };

export function verify(evidence: RepairEvidence, policy: VerifyPolicy): Verdict {
  const failures: string[] = [];
  if (!evidence.redBeforeMatches) failures.push("not-red-before");
  if (!evidence.greenAfter) failures.push("not-green-after");
  if (!evidence.holdoutPassed) failures.push("holdout-failed");
  if (!evidence.reproductionIntact) failures.push("reproduction-modified");
  if (evidence.hasBinaryDiff) failures.push("binary-diff");
  if (evidence.patchTooLarge || evidence.patchBytes > policy.maxPatchBytes) failures.push("patch-too-large");
  if (evidence.changedFiles.some((f) => !policy.allowedPaths.includes(f))) failures.push("path-policy");
  if (evidence.changedFiles.length > policy.maxFiles) failures.push("too-many-files");
  if (evidence.diffLines > policy.maxDiffLines) failures.push("diff-too-large");
  return { ok: failures.length === 0, failures };
}
