import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RegressionFixture } from "../fixtures";
import { createSubstrateIdentity, type Substrate } from "../substrate";
import { dockerVitestCheckRunner, dockerVitestHoldoutRunner } from "../isolated/dockerCheckRunner";
import { ADAPTER_CONFIG, vitestJsonStrategy } from "../real/vitestSubstrate";
import type { Baseline } from "./baseline";
import type { CiFailure } from "./ciReport";

const execFileAsync = promisify(execFile);

export type ChangedFiles = { sourceFiles: string[]; testFiles: string[] };

/** Inspects the repo diff between two commits (injected so unit tests never shell out). */
export interface RepoInspector {
  changedFiles(knownGood: string, defective: string): Promise<ChangedFiles>;
  /** Existing test files that import `sourceRelPath` but are NOT in `excluding` — the
   *  best-effort holdout for a real regression. */
  relatedTestFiles(sourceRelPath: string, excluding: string[]): Promise<string[]>;
}

export type CommitPairSpec = {
  originRepo: string;
  repository: string;
  baseline: Baseline;
  failure: CiFailure;
  image: string;
};

/** A self-contained, always-passing placeholder holdout. v1 does NOT assemble an independent
 *  holdout from existing related tests: their relative imports (`./grade`, `../content/…`) do
 *  not survive relocation to a synthetic holdout path, and an empty file exits vitest with 0
 *  tests (an infra failure that blocks the run). So the kernel's holdout gate runs this valid
 *  green test; the CI false-fix guard instead leans on pinned test files + an isolated
 *  green-after re-run + human review of the needs_review draft (spec §3.3, best-effort). */
const PLACEHOLDER_HOLDOUT = `import { it, expect } from "vitest";\nit("ci holdout placeholder — no independent holdout (v1)", () => { expect(true).toBe(true); });\n`;

/**
 * Build a `RegressionFixture` from two REAL commits (no synthesized mutate — the defect IS
 * the diff). v1 scope: exactly one non-test source file changed, else null (out of scope).
 * The write-allowlist is that one file; the holdout is best-effort related existing tests.
 * Always `production-black-box` (an untrusted LLM author verified in Docker isolation).
 */
export async function buildCommitPairFixture(spec: CommitPairSpec, repo: RepoInspector): Promise<RegressionFixture | null> {
  const { originRepo, baseline, failure, image } = spec;
  const changed = await repo.changedFiles(baseline.knownGoodCommit, baseline.defectiveCommit);
  if (changed.sourceFiles.length !== 1) return null; // v1: single-source-file regressions only
  const sourceRelPath = changed.sourceFiles[0]!;

  const relatedTests = await repo.relatedTestFiles(sourceRelPath, failure.relatedTests);
  const holdoutRelPath = "src/__ci_holdout__.test.ts";
  const holdoutSource = PLACEHOLDER_HOLDOUT;

  const signature = vitestJsonStrategy(failure.signature);
  const adapterConfigContent = await readFile(join(originRepo, ADAPTER_CONFIG), "utf8");
  const adapterConfigSha = createHash("sha256").update(adapterConfigContent).digest("hex");
  const tests = failure.relatedTests;
  const identity = createSubstrateIdentity({
    kind: "vitest-v1",
    isolation: "docker",
    image,
    tests: [...tests].sort(),
    adapterConfig: `${ADAPTER_CONFIG}:${adapterConfigSha}`,
    holdoutPath: holdoutRelPath,
    holdoutSource,
    relatedTestCount: relatedTests.length, // holdout confidence: 0 ⇒ placeholder only (v1)
    signature: failure.signature,
    pinnedPaths: [...tests].sort(),
    readAllowlist: ["src/"],
  });

  const substrate: Substrate = {
    identity,
    runCheck: dockerVitestCheckRunner({ image, tests }),
    runHoldout: dockerVitestHoldoutRunner(image, holdoutRelPath, holdoutSource),
    signature,
    pinnedPaths: tests,
    readAllowlist: ["src/"],
  };

  const fixedSource = await execFileAsync("git", ["show", `${baseline.knownGoodCommit}:${sourceRelPath}`], { cwd: originRepo })
    .then((r) => r.stdout)
    .catch(() => "");

  return {
    repoRoot: originRepo,
    knownGoodCommit: baseline.knownGoodCommit,
    defectiveCommit: baseline.defectiveCommit,
    mainCommit: baseline.defectiveCommit,
    fixedSource,
    sourceRelPath,
    incident: {
      fingerprint: `${failure.signature.errorName}:${failure.signature.testFile}:${failure.signature.testName}`,
      errorType: failure.signature.errorName,
      sourceFile: sourceRelPath,
      symbol: "",
    },
    substrate,
    verificationProfile: "production-black-box",
    cleanup: async () => {}, // the CI checkout is not ours to delete
  };
}
