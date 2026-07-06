import { rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { RegressionFixture } from "../fixtures";
import { createSubstrateIdentity, type CheckResult, type CheckRunner, type Substrate } from "../substrate";
import { dockerVitestCheckRunner, dockerVitestHoldoutRunner, wrapIsolated, type DockerExec } from "../isolated/dockerCheckRunner";
import { vitestJsonStrategy } from "../real/vitestSubstrate";
import type { SentryRepo } from "./sentryRepo";
import type { SynthesizedTest } from "./synthesizer";

export type SentryFixtureSpec = {
  repoRoot: string;
  sourceRelPath: string;
  fnName: string;
  knownGoodCommit: string;
  defectiveCommit: string;
  errorType: string;
  fingerprint: string;
  synthesized: SynthesizedTest;
  image: string;
};

const PLACEHOLDER_HOLDOUT = `import { it, expect } from "vitest";\nit("sentry holdout placeholder — no sibling test (v1)", () => { expect(true).toBe(true); });\n`;

/**
 * A CheckRunner that INJECTS the synthesized test into the worktree, runs it (Docker-isolated),
 * and REMOVES it afterward. The removal is essential: this is the PRIMARY check (it runs BEFORE
 * the kernel captures the fix patch), so if the transient repro test were left in the worktree
 * it would be swept into the patch by `git add -A` and trip the verify path-policy gate (which
 * allows only `sourceRelPath`) → no draft. The file is written on the host (the container mounts
 * the worktree read-only) and deleted in `finally` so it is gone before patch capture.
 */
export function injectingCheckRunner(image: string, relPath: string, source: string, exec?: DockerExec): CheckRunner {
  const inner = dockerVitestCheckRunner({ image, tests: [relPath] }, exec);
  const wrapper: CheckRunner = async (worktreeRoot, signal): Promise<CheckResult> => {
    const abs = join(worktreeRoot, relPath);
    await writeFile(abs, source);
    try {
      return await inner(worktreeRoot, signal);
    } finally {
      await rm(abs, { force: true }).catch(() => {});
    }
  };
  // The wrapper delegates to an isolated runner but is a new closure — register it as isolated
  // (only possible because `inner` is), so the untrusted-repairer guard still accepts runCheck.
  return wrapIsolated(inner, wrapper);
}

/**
 * Assemble a RegressionFixture whose reproduction is the SYNTHESIZED test, injected into the
 * worktree at each check and removed afterward (see injectingCheckRunner — it must not land in
 * the fix patch). Re-injection is the tamper guard, so pinnedPaths = []. The holdout is the
 * deterministic sibling `<basename>.test.ts` at the defective commit if it exists (run in-repo),
 * else a passing placeholder. cleanup is a no-op (this operates on the real checkout).
 */
export async function buildSentryFixture(spec: SentryFixtureSpec, repo: SentryRepo): Promise<RegressionFixture> {
  const { synthesized } = spec;
  const signature = vitestJsonStrategy({ testFile: synthesized.relPath, testName: synthesized.testName, errorName: spec.errorType });

  const siblingRel = join(dirname(spec.sourceRelPath), basename(spec.sourceRelPath).replace(/\.[cm]?[jt]sx?$/, "") + ".test.ts");
  const hasSibling = await repo.fileExistsAt(spec.defectiveCommit, siblingRel);
  const runHoldout = hasSibling
    ? dockerVitestCheckRunner({ image: spec.image, tests: [siblingRel] })
    : dockerVitestHoldoutRunner(spec.image, "src/__sentry_holdout__.test.ts", PLACEHOLDER_HOLDOUT);

  const identity = createSubstrateIdentity({
    kind: "sentry-vitest-v1",
    image: spec.image,
    synthPath: synthesized.relPath,
    synthSource: synthesized.source,
    holdout: hasSibling ? { kind: "sibling", path: siblingRel } : { kind: "placeholder" },
    signature: { testFile: synthesized.relPath, testName: synthesized.testName, errorName: spec.errorType },
    sourceRelPath: spec.sourceRelPath,
  });

  const substrate: Substrate = {
    identity,
    // The synthesized test is not in any commit → inject it before each run AND remove it after,
    // so it never reaches the fix patch / the verify path-policy gate.
    runCheck: injectingCheckRunner(spec.image, synthesized.relPath, synthesized.source),
    runHoldout,
    signature,
    pinnedPaths: [], // re-injection protects the reproduction; nothing persistent to pin
    readAllowlist: ["src/"],
  };

  return {
    repoRoot: spec.repoRoot,
    knownGoodCommit: spec.knownGoodCommit,
    defectiveCommit: spec.defectiveCommit,
    mainCommit: spec.defectiveCommit,
    fixedSource: "", // the known-good source is not needed (LlmRepairer, not the oracle, repairs)
    sourceRelPath: spec.sourceRelPath,
    incident: { fingerprint: spec.fingerprint, errorType: spec.errorType, sourceFile: spec.sourceRelPath, symbol: spec.fnName },
    substrate,
    verificationProfile: "production-black-box",
    cleanup: async () => {}, // no-op: real checkout, not a temp clone
  };
}
