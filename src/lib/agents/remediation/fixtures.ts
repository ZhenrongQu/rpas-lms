import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RegressionFixture = {
  repoRoot: string;
  knownGoodCommit: string;
  defectiveCommit: string;
  incident: {
    fingerprint: "TypeError:score:score.ts";
    errorType: "TypeError";
    sourceFile: "src/score.ts";
    symbol: "score";
  };
  cleanup: () => Promise<void>;
};

const GOOD_SOURCE = `export function score(answers: Array<{ score: number }>, index: number): number {
  return answers[index]?.score ?? 0;
}\n`;

const BAD_SOURCE = `export function score(answers: Array<{ score: number }>, index: number): number {
  return answers[index].score;
}\n`;

const TEST_SOURCE = `import { expect, it } from "vitest";
import { score } from "./score";

it("returns zero for a missing answer", () => {
  expect(score([], 0)).toBe(0);
});\n`;

export async function createRegressionFixture(): Promise<RegressionFixture> {
  const repoRoot = await mkdtemp(join(tmpdir(), "remediation-fixture-"));
  const git = (args: string[]) => execFileAsync("git", args, { cwd: repoRoot });
  try {
    await mkdir(join(repoRoot, "src"));
    await git(["init", "--initial-branch=main"]);
    await git(["config", "user.name", "Remediation Fixture"]);
    await git(["config", "user.email", "fixture@example.invalid"]);
    await writeFile(join(repoRoot, "src/score.ts"), GOOD_SOURCE);
    await writeFile(join(repoRoot, "src/score.test.ts"), TEST_SOURCE);
    await git(["add", "src/score.ts", "src/score.test.ts"]);
    await git(["commit", "-m", "fixture: known good"]);
    const knownGoodCommit = (await git(["rev-parse", "HEAD"])).stdout.trim();

    await writeFile(join(repoRoot, "src/score.ts"), BAD_SOURCE);
    await git(["add", "src/score.ts"]);
    await git(["commit", "-m", "fixture: introduce regression"]);
    const defectiveCommit = (await git(["rev-parse", "HEAD"])).stdout.trim();

    return {
      repoRoot,
      knownGoodCommit,
      defectiveCommit,
      incident: {
        fingerprint: "TypeError:score:score.ts",
        errorType: "TypeError",
        sourceFile: "src/score.ts",
        symbol: "score",
      },
      cleanup: () => rm(repoRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(repoRoot, { recursive: true, force: true });
    throw error;
  }
}
