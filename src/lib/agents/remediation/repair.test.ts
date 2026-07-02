import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegressionFixture, type RegressionFixture } from "./fixtures";
import { fixtureRepairerFor, LlmRepairer, makeRepairContext } from "./repair";

const created: RegressionFixture[] = [];
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((f) => f.cleanup()));
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const POLICY = { allowedPaths: ["src/score.mjs"], pinnedPaths: ["src/check.mjs"] };
const never = new AbortController().signal;

describe("FixtureRepairer + capability context", () => {
  it("applies the fixture's fixed source to the source path", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, never);
    await fixtureRepairerFor(fixture).repair(ctx);
    expect(await ctx.readFile("src/score.mjs")).toContain("?.score ?? 0");
  });

  it("rejects writes to pinned, out-of-tree, absolute, and non-allowed paths", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, never);
    await expect(ctx.writeFile("src/check.mjs", "x")).rejects.toThrow(/pinned/);
    await expect(ctx.writeFile("../escape.mjs", "x")).rejects.toThrow(/escapes/);
    await expect(ctx.writeFile("/etc/x", "x")).rejects.toThrow(/escapes|not allowed/);
    await expect(ctx.writeFile(".git/config", "x")).rejects.toThrow(/not allowed/);
  });

  it("rejects reads that traverse a symlink out of the worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "repair-wt-"));
    const outside = await mkdtemp(join(tmpdir(), "repair-outside-"));
    dirs.push(root, outside);
    await mkdir(join(root, "src"));
    await writeFile(join(outside, "secret.txt"), "top secret");
    await symlink(outside, join(root, "src", "leak"));
    const ctx = makeRepairContext(root, POLICY, never);
    await expect(ctx.readFile("src/leak/secret.txt")).rejects.toThrow(/symlink/);
  });

  it("LlmRepairer is a not-implemented stub", async () => {
    await expect(new LlmRepairer().repair()).rejects.toThrow(/not implemented/);
  });
});
