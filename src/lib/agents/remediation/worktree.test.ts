import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRegressionFixture, type RegressionFixture } from "./fixtures";
import { expectCompleted, scriptCheckRunner } from "./substrate";
import { runCheckAtCommit } from "./worktree";

const check = scriptCheckRunner("src/check.mjs");

const execFileAsync = promisify(execFile);
const created: RegressionFixture[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((fixture) => fixture.cleanup()));
});

describe("runCheckAtCommit", () => {
  it("runs the check green at the known-good commit and red at the defective one, cleaning up", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);

    const good = expectCompleted(await runCheckAtCommit(fixture.repoRoot, fixture.knownGoodCommit, check));
    expect(good.exitCode).toBe(0);

    const bad = expectCompleted(await runCheckAtCommit(fixture.repoRoot, fixture.defectiveCommit, check));
    expect(bad.exitCode).not.toBe(0);
    expect(bad.stderr).toContain("TypeError");

    // every temporary worktree was removed — only the main worktree remains
    const { stdout } = await execFileAsync("git", ["worktree", "list"], { cwd: fixture.repoRoot });
    expect(stdout.split("\n").filter(Boolean)).toHaveLength(1);
  });
});
