import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRegressionFixture, type RegressionFixture } from "./fixtures";

const execFileAsync = promisify(execFile);
const created: RegressionFixture[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((fixture) => fixture.cleanup()));
});

describe("regression fixture repository", () => {
  it("creates distinct known-good and defective commits", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    expect(fixture.knownGoodCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.defectiveCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.defectiveCommit).not.toBe(fixture.knownGoodCommit);

    const good = await execFileAsync("git", ["show", `${fixture.knownGoodCommit}:src/score.ts`], { cwd: fixture.repoRoot });
    const bad = await execFileAsync("git", ["show", `${fixture.defectiveCommit}:src/score.ts`], { cwd: fixture.repoRoot });
    expect(good.stdout).toContain("answers[index]?.score ?? 0");
    expect(bad.stdout).toContain("answers[index].score");
  });
});
