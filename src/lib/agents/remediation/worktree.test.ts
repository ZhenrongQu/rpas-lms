import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRegressionFixture, type RegressionFixture } from "./fixtures";
import { runCheckAtCommit } from "./worktree";

const execFileAsync = promisify(execFile);
const created: RegressionFixture[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((fixture) => fixture.cleanup()));
});

describe("runCheckAtCommit", () => {
  it("runs the check green at the known-good commit and red at the defective one, cleaning up", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);

    const good = await runCheckAtCommit(fixture.repoRoot, fixture.knownGoodCommit, "src/check.mjs");
    expect(good.exitCode).toBe(0);

    const bad = await runCheckAtCommit(fixture.repoRoot, fixture.defectiveCommit, "src/check.mjs");
    expect(bad.exitCode).not.toBe(0);
    expect(bad.stderr).toContain("TypeError");

    // every temporary worktree was removed — only the main worktree remains
    const { stdout } = await execFileAsync("git", ["worktree", "list"], { cwd: fixture.repoRoot });
    expect(stdout.split("\n").filter(Boolean)).toHaveLength(1);
  });
});
