import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { nodeStackStrategy } from "./signature";
import { createSubstrateIdentity, scriptCheckRunner, scriptHoldoutRunner, type Substrate } from "./substrate";

const execFileAsync = promisify(execFile);

export type FixtureVariant = "reproducible" | "already-fixed" | "non-portable" | "control-broken";

export type RegressionFixture = {
  repoRoot: string;
  knownGoodCommit: string;
  defectiveCommit: string;
  /** The tip a fix worktree would check out ("latest main"). Equals the defective
   *  commit for `reproducible`; a later fix/refactor commit for the other variants. */
  mainCommit: string;
  /** The known-correct source + its path, for the deterministic FixtureRepairer. */
  fixedSource: string;
  sourceRelPath: string;
  incident: {
    fingerprint: string;
    errorType: string;
    sourceFile: string;
    symbol: string;
  };
  /** How this fixture runs its check + hidden holdout, fingerprints failures, and
   *  bounds the repairer — script (`node`) here, real vitest for real-repo fixtures. */
  substrate: Substrate;
  cleanup: () => Promise<void>;
};

// Dependency-free ESM so `node src/check.mjs` runs inside a throwaway worktree with
// no node_modules. The defective source dereferences a missing element (TypeError);
// the good source guards it. The renamed "fix" models a non-portable reproduction.
const GOOD_SOURCE = `export function score(answers, index) {
  return answers[index]?.score ?? 0;
}
`;

const BAD_SOURCE = `export function score(answers, index) {
  return answers[index].score;
}
`;

const RENAMED_SOURCE = `export function computeScore(answers, index) {
  return answers[index]?.score ?? 0;
}
`;

// A control that is itself broken (throws on the empty-array control input), but
// textually distinct from BAD_SOURCE so the later defective commit still diffs.
const CONTROL_BROKEN_SOURCE = `export function score(answers, index) {
  return answers[index].score + 0;
}
`;

const CHECK_SOURCE = `import { score } from "./score.mjs";
const got = score([], 0);
if (got !== 0) {
  console.error(\`AssertionError: expected 0, got \${got}\`);
  process.exit(1);
}
`;

// Hidden holdout: asserts a case the visible check does NOT cover (a present
// element), so a "return 0"-style hardcode passes CHECK_SOURCE but fails here.
const HOLDOUT_SOURCE = `import { score } from "./score.mjs";
const got = score([{ score: 5 }], 0);
if (got !== 5) {
  console.error(\`HoldoutError: expected 5, got \${got}\`);
  process.exit(1);
}
`;

export async function createRegressionFixture(
  opts: { variant?: FixtureVariant } = {},
): Promise<RegressionFixture> {
  const variant = opts.variant ?? "reproducible";
  const repoRoot = await mkdtemp(join(tmpdir(), "remediation-fixture-"));
  const git = (args: string[]) => execFileAsync("git", args, { cwd: repoRoot });
  const head = async () => (await git(["rev-parse", "HEAD"])).stdout.trim();
  try {
    await mkdir(join(repoRoot, "src"));
    await git(["init", "--initial-branch=main"]);
    await git(["config", "user.name", "Remediation Fixture"]);
    await git(["config", "user.email", "fixture@example.invalid"]);

    // control-broken: the "known-good" control is itself defective, so a
    // reproduction must refuse to proceed (the negative control is mandatory).
    const controlSource = variant === "control-broken" ? CONTROL_BROKEN_SOURCE : GOOD_SOURCE;
    await writeFile(join(repoRoot, "src/score.mjs"), controlSource);
    await writeFile(join(repoRoot, "src/check.mjs"), CHECK_SOURCE);
    await git(["add", "src/score.mjs", "src/check.mjs"]);
    await git(["commit", "-m", "fixture: known good"]);
    const knownGoodCommit = await head();

    await writeFile(join(repoRoot, "src/score.mjs"), BAD_SOURCE);
    await git(["add", "src/score.mjs"]);
    await git(["commit", "-m", "fixture: introduce regression"]);
    const defectiveCommit = await head();

    let mainCommit = defectiveCommit;
    if (variant === "already-fixed") {
      await writeFile(join(repoRoot, "src/score.mjs"), GOOD_SOURCE);
      await git(["add", "src/score.mjs"]);
      await git(["commit", "-m", "fixture: fix on main"]);
      mainCommit = await head();
    } else if (variant === "non-portable") {
      await writeFile(join(repoRoot, "src/score.mjs"), RENAMED_SOURCE);
      await git(["add", "src/score.mjs"]);
      await git(["commit", "-m", "fixture: rename score export on main"]);
      mainCommit = await head();
    }

    const incident = {
      fingerprint: "TypeError:score:score.mjs",
      errorType: "TypeError",
      sourceFile: "src/score.mjs",
      symbol: "score",
    };
    return {
      repoRoot,
      knownGoodCommit,
      defectiveCommit,
      mainCommit,
      fixedSource: GOOD_SOURCE,
      sourceRelPath: "src/score.mjs",
      incident,
      substrate: {
        identity: createSubstrateIdentity({
          kind: "script-v1",
          checkPath: "src/check.mjs",
          checkSource: CHECK_SOURCE,
          holdoutPath: "src/__holdout__.mjs",
          holdoutSource: HOLDOUT_SOURCE,
          signature: incident,
          pinnedPaths: ["src/check.mjs"],
          readAllowlist: ["src/"],
        }),
        runCheck: scriptCheckRunner("src/check.mjs"),
        runHoldout: scriptHoldoutRunner(HOLDOUT_SOURCE),
        signature: nodeStackStrategy(incident),
        pinnedPaths: ["src/check.mjs"],
        readAllowlist: ["src/"],
      },
      cleanup: () => rm(repoRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(repoRoot, { recursive: true, force: true });
    throw error;
  }
}
