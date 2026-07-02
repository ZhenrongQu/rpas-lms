import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RegressionFixture } from "../fixtures";
import type { Substrate } from "../substrate";
import { dockerVitestCheckRunner, dockerVitestHoldoutRunner } from "../isolated/dockerCheckRunner";
import { vitestCheckRunner, vitestHoldoutRunner, vitestJsonStrategy, type VitestIncident } from "./vitestSubstrate";

const execFileAsync = promisify(execFile);

/** Where the (possibly untrusted) check code executes: `host` = real vitest on the
 *  worker (trusted authors only); `docker` = isolated container (required for LLM). */
export type FixtureIsolation = { isolation?: "host"; image?: never } | { isolation: "docker"; image: string };

/**
 * A synthesized real-repo defect: a KNOWN mutation of a real source file whose real
 * vitest test then goes red. The reproduction/verify substrate is real vitest; the
 * kernel is unchanged. See buildRealRepoFixture for how it maps onto a fixture.
 */
export type RealRepoDefectSpec = {
  /** The real checkout to source code + node_modules from (e.g. process.cwd()). */
  originRepo: string;
  /** The one real source file the defect is injected into (and the only writable path). */
  sourceRelPath: string;
  /** Turn the known-good source into the defective source. */
  mutate: (good: string) => string;
  /** Real test file(s) that reproduce the defect — the visible, pinned reproduction. */
  relatedTests: string[];
  /** A hidden holdout test injected only at verify (never seen during repair). */
  holdout: { relPath: string; source: string };
  /** Incident fingerprint, for the driver's incident correlation. */
  fingerprint: string;
  /** The failing-test identity the vitest signature strategy matches against. */
  signature: VitestIncident;
};

/**
 * Build a fixture backed by REAL rpas-lms code + the REAL vitest toolchain. The
 * origin repo is locally cloned into a throwaway dir, and the defect is committed
 * ONLY in that clone (a separate object store) — the origin's history is never
 * touched. The same deterministic kernel drives it; only the substrate is real.
 */
export async function buildRealRepoFixture(spec: RealRepoDefectSpec, opts: FixtureIsolation = {}): Promise<RegressionFixture> {
  if (opts.isolation === "docker" && !opts.image) {
    throw new Error("isolation 'docker' requires an image tag (call ensureImage first)");
  }
  const signature = vitestJsonStrategy(spec.signature);
  const substrate: Substrate =
    opts.isolation === "docker"
      ? {
          runCheck: dockerVitestCheckRunner({ image: opts.image, tests: spec.relatedTests }),
          runHoldout: dockerVitestHoldoutRunner(opts.image, spec.holdout.relPath, spec.holdout.source),
          signature,
          pinnedPaths: spec.relatedTests,
          readAllowlist: ["src/"],
        }
      : {
          runCheck: vitestCheckRunner(spec.originRepo, spec.relatedTests),
          runHoldout: vitestHoldoutRunner(spec.originRepo, spec.holdout.relPath, spec.holdout.source),
          signature,
          pinnedPaths: spec.relatedTests,
          readAllowlist: ["src/"],
        };
  const clone = await mkdtemp(join(tmpdir(), "real-fixture-"));
  const git = (args: string[]) => execFileAsync("git", args, { cwd: clone });
  const head = async () => (await git(["rev-parse", "HEAD"])).stdout.trim();
  try {
    // --no-hardlinks: fully independent object store, so a defect commit here can
    // never reach the origin repo's objects.
    await execFileAsync("git", ["clone", "--quiet", "--no-hardlinks", spec.originRepo, clone]);
    await git(["config", "user.name", "Real Fixture"]);
    await git(["config", "user.email", "real@example.invalid"]);
    const knownGoodCommit = await head();

    const good = await readFile(join(clone, spec.sourceRelPath), "utf8");
    const bad = spec.mutate(good);
    if (bad === good) throw new Error(`mutate() did not change ${spec.sourceRelPath} — the defect would not reproduce`);
    await writeFile(join(clone, spec.sourceRelPath), bad);
    await git(["add", spec.sourceRelPath]);
    await git(["commit", "--quiet", "-m", "inject defect"]);
    const defectiveCommit = await head();

    return {
      repoRoot: clone,
      knownGoodCommit,
      defectiveCommit,
      mainCommit: defectiveCommit,
      fixedSource: good,
      sourceRelPath: spec.sourceRelPath,
      incident: {
        fingerprint: spec.fingerprint,
        errorType: spec.signature.errorName,
        sourceFile: spec.sourceRelPath,
        symbol: "",
      },
      substrate,
      cleanup: () => rm(clone, { recursive: true, force: true }),
    };
  } catch (e) {
    await rm(clone, { recursive: true, force: true });
    throw e;
  }
}

// A hidden holdout: the general dedup + exact-set property. A false-fix that only
// special-cases the visible test's input would fail here.
const GRADE_HOLDOUT = `import { describe, it, expect } from "vitest";
import { isAnswerCorrect } from "./grade";
import type { Question } from "../content/types";

const multi = {
  id: "h", moduleId: "air-law", certLevel: "BASIC", type: "MULTI", selectCount: 2, difficulty: 1,
  stem: { EN: "?", ZH: "?" },
  options: [
    { id: "a", label: { EN: "A", ZH: "A" }, isCorrect: true },
    { id: "b", label: { EN: "B", ZH: "B" }, isCorrect: true },
    { id: "c", label: { EN: "C", ZH: "C" }, isCorrect: false },
  ],
  explanation: { EN: "", ZH: "" }, reference: { EN: "", ZH: "" }, tags: [],
} as unknown as Question;

describe("grade holdout (hidden)", () => {
  it("dedups arbitrary duplicates and keeps the exact-set requirement", () => {
    expect(isAnswerCorrect(multi, ["a", "a", "a", "b"])).toBe(true);
    expect(isAnswerCorrect(multi, ["a", "b", "b"])).toBe(true);
    expect(isAnswerCorrect(multi, ["a", "a"])).toBe(false); // dedups to [a] -> partial, not the full set
  });
});
`;

/**
 * The first real defect: drop the Set-dedup in isAnswerCorrect, so a duplicate
 * selection inflates the length and the "ignores duplicate selections" test in
 * grade.test.ts fails with an AssertionError (a value-only bug — it never throws).
 */
export function gradeDedupDefect(originRepo: string): RealRepoDefectSpec {
  return {
    originRepo,
    sourceRelPath: "src/lib/exam/grade.ts",
    mutate: (good) => good.replace("[...new Set(selected)]", "[...selected]"),
    relatedTests: ["src/lib/exam/grade.test.ts"],
    holdout: { relPath: "src/lib/exam/__grade_holdout__.test.ts", source: GRADE_HOLDOUT },
    fingerprint: "AssertionError:grade.test.ts:ignores duplicate selections",
    signature: {
      testFile: "src/lib/exam/grade.test.ts",
      testName: "ignores duplicate selections",
      errorName: "AssertionError",
    },
  };
}
