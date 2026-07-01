import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type FixtureVariant = "reproducible" | "already-fixed" | "non-portable";

export type RegressionFixture = {
  repoRoot: string;
  knownGoodCommit: string;
  defectiveCommit: string;
  /** The tip a fix worktree would check out ("latest main"). Equals the defective
   *  commit for `reproducible`; a later fix/refactor commit for the other variants. */
  mainCommit: string;
  incident: {
    fingerprint: string;
    errorType: "TypeError";
    sourceFile: "src/score.mjs";
    symbol: "score";
  };
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

const CHECK_SOURCE = `import { score } from "./score.mjs";
const got = score([], 0);
if (got !== 0) {
  console.error(\`AssertionError: expected 0, got \${got}\`);
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

    await writeFile(join(repoRoot, "src/score.mjs"), GOOD_SOURCE);
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

    return {
      repoRoot,
      knownGoodCommit,
      defectiveCommit,
      mainCommit,
      incident: {
        fingerprint: "TypeError:score:score.mjs",
        errorType: "TypeError",
        sourceFile: "src/score.mjs",
        symbol: "score",
      },
      cleanup: () => rm(repoRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(repoRoot, { recursive: true, force: true });
    throw error;
  }
}
