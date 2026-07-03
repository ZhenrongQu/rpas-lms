import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildRealRepoFixture, gradeDedupDefect, type RealRepoDefectSpec } from "./fixture";
import type { RegressionFixture } from "../fixtures";
import { isIsolated } from "../isolated/dockerCheckRunner";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((c) => c()));
});

// A tiny throwaway origin repo — enough to clone + mutate, WITHOUT running vitest.
async function fakeOrigin(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fake-origin-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const git = (args: string[]) => execFileAsync("git", args, { cwd: dir });
  await git(["init", "--quiet", "--initial-branch=main"]);
  await git(["config", "user.name", "Origin"]);
  await git(["config", "user.email", "origin@example.invalid"]);
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src/foo.ts"), source);
  // The real origin always ships the adapter config; the fixture builder hashes its
  // content into the substrate identity, so a fake origin must provide one too.
  await writeFile(join(dir, "vitest.adapter.config.mts"), "export default {};\n");
  await git(["add", "-A"]);
  await git(["commit", "--quiet", "-m", "good"]);
  return dir;
}

async function show(fixture: RegressionFixture, commit: string, path: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["show", `${commit}:${path}`], { cwd: fixture.repoRoot });
  return stdout;
}

describe("buildRealRepoFixture", () => {
  it("clones the origin, commits the mutation, and assembles a vitest substrate", async () => {
    const good = "export const answer = 1;\n";
    const origin = await fakeOrigin(good);
    const spec: RealRepoDefectSpec = {
      originRepo: origin,
      sourceRelPath: "src/foo.ts",
      mutate: (s) => s.replace("1", "2"),
      relatedTests: ["src/foo.test.ts"],
      holdout: { relPath: "src/__holdout__.test.ts", source: "// hidden" },
      fingerprint: "AssertionError:foo.test.ts:answer",
      signature: { testFile: "src/foo.test.ts", testName: "answer", errorName: "AssertionError" },
    };

    const fixture = await buildRealRepoFixture(spec);
    cleanups.push(fixture.cleanup);

    expect(fixture.knownGoodCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.defectiveCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.defectiveCommit).not.toBe(fixture.knownGoodCommit);
    expect(fixture.fixedSource).toBe(good); // the known-good source, for the oracle
    expect(fixture.sourceRelPath).toBe("src/foo.ts");
    expect(fixture.incident.fingerprint).toBe(spec.fingerprint);
    expect(fixture.substrate.pinnedPaths).toEqual(["src/foo.test.ts"]); // the repairer must not edit the test
    expect(fixture.substrate.readAllowlist).toEqual(["src/"]);

    // the defect really landed on the defective commit; the good source on known-good
    expect(await show(fixture, fixture.knownGoodCommit, "src/foo.ts")).toBe(good);
    expect(await show(fixture, fixture.defectiveCommit, "src/foo.ts")).toContain("answer = 2");
    expect(isIsolated(fixture.substrate.runCheck)).toBe(false); // host by default
  });

  it("isolation 'docker' assembles an isolated substrate (runCheck + holdout tagged isolated)", async () => {
    const origin = await fakeOrigin("export const answer = 1;\n");
    const spec: RealRepoDefectSpec = {
      originRepo: origin,
      sourceRelPath: "src/foo.ts",
      mutate: (s) => s.replace("1", "2"),
      relatedTests: ["src/foo.test.ts"],
      holdout: { relPath: "src/__holdout__.test.ts", source: "// hidden" },
      fingerprint: "AssertionError:foo.test.ts:answer",
      signature: { testFile: "src/foo.test.ts", testName: "answer", errorName: "AssertionError" },
    };
    const fixture = await buildRealRepoFixture(spec, { isolation: "docker", image: "remediation-vitest:test" });
    cleanups.push(fixture.cleanup);
    expect(isIsolated(fixture.substrate.runCheck)).toBe(true);
    expect(isIsolated(fixture.substrate.runHoldout)).toBe(true);
  });

  it("isolation 'docker' requires an image", async () => {
    const origin = await fakeOrigin("export const x = 1;\n");
    const spec: RealRepoDefectSpec = {
      originRepo: origin,
      sourceRelPath: "src/foo.ts",
      mutate: (s) => s.replace("1", "2"),
      relatedTests: ["src/foo.test.ts"],
      holdout: { relPath: "src/__holdout__.test.ts", source: "" },
      fingerprint: "x",
      signature: { testFile: "src/foo.test.ts", testName: "x", errorName: "AssertionError" },
    };
    // @ts-expect-error docker isolation must supply an image
    await expect(buildRealRepoFixture(spec, { isolation: "docker" })).rejects.toThrow();
  });

  it("refuses a mutation that does not change the source", async () => {
    const origin = await fakeOrigin("export const x = 1;\n");
    const spec: RealRepoDefectSpec = {
      originRepo: origin,
      sourceRelPath: "src/foo.ts",
      mutate: (s) => s, // no-op
      relatedTests: ["src/foo.test.ts"],
      holdout: { relPath: "src/__holdout__.test.ts", source: "" },
      fingerprint: "x",
      signature: { testFile: "src/foo.test.ts", testName: "x", errorName: "AssertionError" },
    };
    await expect(buildRealRepoFixture(spec)).rejects.toThrow(/did not change/);
  });
});

describe("gradeDedupDefect", () => {
  it("its mutation actually alters the real grade.ts (the target string exists)", async () => {
    const good = await readFile("src/lib/exam/grade.ts", "utf8");
    const spec = gradeDedupDefect("/unused");
    const bad = spec.mutate(good);
    expect(bad).not.toBe(good);
    expect(bad).toContain("[...selected]"); // dedup removed
    expect(bad).not.toContain("[...new Set(selected)]");
  });
});
