import { describe, expect, it } from "vitest";
import type { RepairEvidence } from "./fixAttempt";
import { verify, type VerifyPolicy } from "./verify";

const clean: RepairEvidence = {
  baseCommit: "abc",
  reproductionHash: "h",
  reproductionIntact: true,
  redBeforeMatches: true,
  redBeforeSignature: null,
  greenAfter: true,
  changedFiles: ["src/score.mjs"],
  diffLines: 3,
  hasBinaryDiff: false,
  patch: "diff --git …",
  patchBytes: 12,
  patchTooLarge: false,
};

const policy: VerifyPolicy = { allowedPaths: ["src/score.mjs"], maxFiles: 5, maxDiffLines: 200, maxPatchBytes: 1000 };

describe("verify", () => {
  it("passes clean evidence", () => {
    expect(verify(clean, policy)).toEqual({ ok: true, failures: [] });
  });

  it.each<[string, Partial<RepairEvidence>, string]>([
    ["not-red-before", { redBeforeMatches: false }, "not-red-before"],
    ["not-green-after", { greenAfter: false }, "not-green-after"],
    ["reproduction-modified", { reproductionIntact: false }, "reproduction-modified"],
    ["binary-diff", { hasBinaryDiff: true }, "binary-diff"],
    ["patch-too-large (flag)", { patchTooLarge: true }, "patch-too-large"],
    ["patch-too-large (bytes)", { patchBytes: 5000 }, "patch-too-large"],
    ["path-policy", { changedFiles: ["src/other.mjs"] }, "path-policy"],
    ["too-many-files", { changedFiles: ["a", "b", "c", "d", "e", "f"] }, "too-many-files"],
    ["diff-too-large", { diffLines: 201 }, "diff-too-large"],
  ])("fails %s", (_name, override, failure) => {
    const result = verify({ ...clean, ...override }, policy);
    expect(result.ok).toBe(false);
    expect(result.failures).toContain(failure);
  });
});
