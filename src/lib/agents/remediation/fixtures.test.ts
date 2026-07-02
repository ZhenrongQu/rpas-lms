import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRegressionFixture, type RegressionFixture } from "./fixtures";

const execFileAsync = promisify(execFile);
const created: RegressionFixture[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((fixture) => fixture.cleanup()));
});

async function show(fixture: RegressionFixture, commit: string, path: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["show", `${commit}:${path}`], { cwd: fixture.repoRoot });
  return stdout;
}

describe("regression fixture repository", () => {
  it("emits dependency-free node source across known-good and defective commits", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    expect(fixture.knownGoodCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.defectiveCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.defectiveCommit).not.toBe(fixture.knownGoodCommit);
    // reproducible: the main tip is still the defective commit
    expect(fixture.mainCommit).toBe(fixture.defectiveCommit);

    expect(await show(fixture, fixture.knownGoodCommit, "src/score.mjs")).toContain("?.score ?? 0");
    expect(await show(fixture, fixture.defectiveCommit, "src/score.mjs")).toContain("answers[index].score");

    // the check is dependency-free — no test framework to resolve in a worktree
    const check = await show(fixture, fixture.knownGoodCommit, "src/check.mjs");
    expect(check).toContain("./score.mjs");
    expect(check).not.toContain("vitest");
  });

  it("already-fixed variant restores the good source on the main tip", async () => {
    const fixture = await createRegressionFixture({ variant: "already-fixed" });
    created.push(fixture);
    expect(fixture.mainCommit).not.toBe(fixture.defectiveCommit);
    expect(await show(fixture, fixture.mainCommit, "src/score.mjs")).toContain("?.score ?? 0");
  });

  it("non-portable variant renames the exported symbol on the main tip", async () => {
    const fixture = await createRegressionFixture({ variant: "non-portable" });
    created.push(fixture);
    expect(fixture.mainCommit).not.toBe(fixture.defectiveCommit);
    expect(await show(fixture, fixture.mainCommit, "src/score.mjs")).toContain("computeScore");
  });
});
