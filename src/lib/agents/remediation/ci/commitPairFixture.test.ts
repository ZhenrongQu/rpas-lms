import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { buildCommitPairFixture, type RepoInspector } from "./commitPairFixture";

const run = promisify(execFile);
const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

async function repoWithTwoCommits(): Promise<{ dir: string; good: string; bad: string }> {
  const dir = await mkdtemp(join(tmpdir(), "cpf-"));
  created.push(dir);
  const git = (a: string[]) => run("git", a, { cwd: dir });
  await git(["init", "-q"]);
  await git(["config", "user.email", "t@t.invalid"]);
  await git(["config", "user.name", "t"]);
  // The builder hashes the adapter config for the substrate identity — the repo must carry it.
  await writeFile(join(dir, "vitest.adapter.config.mts"), "export default {};\n");
  await writeFile(join(dir, "score.mjs"), "export const f = (x) => x;\n");
  await git(["add", "."]); await git(["commit", "-qm", "good"]);
  const good = (await git(["rev-parse", "HEAD"])).stdout.trim();
  await writeFile(join(dir, "score.mjs"), "export const f = (x) => x + 1;\n");
  await git(["add", "."]); await git(["commit", "-qm", "bad"]);
  const bad = (await git(["rev-parse", "HEAD"])).stdout.trim();
  return { dir, good, bad };
}

const failure = { signature: { testFile: "score.test.mjs", testName: "t", errorName: "AssertionError" }, relatedTests: ["score.test.mjs"] };

describe("buildCommitPairFixture", () => {
  it("builds a fixture for a single-source-file regression", async () => {
    const { dir, good, bad } = await repoWithTwoCommits();
    const inspector: RepoInspector = {
      changedFiles: async () => ({ sourceFiles: ["score.mjs"], testFiles: [] }),
      relatedTestFiles: async () => [],
    };
    const fx = await buildCommitPairFixture(
      { originRepo: dir, repository: "o/r", baseline: { knownGoodCommit: good, defectiveCommit: bad }, failure, image: "img:tag" },
      inspector,
    );
    expect(fx).not.toBeNull();
    expect(fx!.knownGoodCommit).toBe(good);
    expect(fx!.defectiveCommit).toBe(bad);
    expect(fx!.sourceRelPath).toBe("score.mjs");
    expect(fx!.verificationProfile).toBe("production-black-box");
    expect(fx!.incident.fingerprint).toContain("AssertionError");
  });

  it("pins the related green tests, so a repairer cannot rewrite its own holdout", async () => {
    const { dir, good, bad } = await repoWithTwoCommits();
    const inspector: RepoInspector = {
      changedFiles: async () => ({ sourceFiles: ["score.mjs"], testFiles: [] }),
      relatedTestFiles: async () => ["score.extra.test.mjs"],
    };
    const fx = await buildCommitPairFixture(
      { originRepo: dir, repository: "o/r", baseline: { knownGoodCommit: good, defectiveCommit: bad }, failure, image: "img:tag" },
      inspector,
    );
    // Both the reproducing test and the holdout test are pinned.
    expect(fx!.substrate.pinnedPaths).toContain("score.test.mjs");
    expect(fx!.substrate.pinnedPaths).toContain("score.extra.test.mjs");
  });

  it("gives a real holdout a different substrate identity than the vacuous placeholder", async () => {
    const { dir, good, bad } = await repoWithTwoCommits();
    const spec = { originRepo: dir, repository: "o/r", baseline: { knownGoodCommit: good, defectiveCommit: bad }, failure, image: "img:tag" };
    const withHoldout = await buildCommitPairFixture(spec, {
      changedFiles: async () => ({ sourceFiles: ["score.mjs"], testFiles: [] }),
      relatedTestFiles: async () => ["score.extra.test.mjs"],
    });
    const withPlaceholder = await buildCommitPairFixture(spec, {
      changedFiles: async () => ({ sourceFiles: ["score.mjs"], testFiles: [] }),
      relatedTestFiles: async () => [],
    });
    // A run verified against a real holdout must never be mistaken for one that was not.
    expect(withHoldout!.substrate.identity).not.toBe(withPlaceholder!.substrate.identity);
  });

  it("falls back to the placeholder when no related green test covers the source", async () => {
    const { dir, good, bad } = await repoWithTwoCommits();
    const fx = await buildCommitPairFixture(
      { originRepo: dir, repository: "o/r", baseline: { knownGoodCommit: good, defectiveCommit: bad }, failure, image: "img:tag" },
      {
        changedFiles: async () => ({ sourceFiles: ["score.mjs"], testFiles: [] }),
        relatedTestFiles: async () => [],
      },
    );
    expect(fx!.substrate.pinnedPaths).toEqual(["score.test.mjs"]);
  });

  it("returns null when the diff touches multiple source files (out of v1 scope)", async () => {
    const { dir, good, bad } = await repoWithTwoCommits();
    const inspector: RepoInspector = {
      changedFiles: async () => ({ sourceFiles: ["a.mjs", "b.mjs"], testFiles: [] }),
      relatedTestFiles: async () => [],
    };
    const fx = await buildCommitPairFixture(
      { originRepo: dir, repository: "o/r", baseline: { knownGoodCommit: good, defectiveCommit: bad }, failure, image: "img:tag" },
      inspector,
    );
    expect(fx).toBeNull();
  });
});
