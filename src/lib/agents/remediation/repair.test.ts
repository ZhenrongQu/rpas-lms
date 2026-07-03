import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegressionFixture, type RegressionFixture } from "./fixtures";
import { __trustRepairerForTest, FixtureRepairer, fixtureRepairerFor, isTrustedRepairer, makeRepairContext, type Repairer } from "./repair";
import { InfrastructureFailure, type CheckRunner } from "./substrate";

const infraRunner: CheckRunner = async () => ({ kind: "infrastructure-failure", reason: "docker unavailable" });

const created: RegressionFixture[] = [];
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((f) => f.cleanup()));
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const POLICY = { allowedPaths: ["src/score.mjs"], pinnedPaths: ["src/check.mjs"], readAllowlist: ["src/"] };
const never = new AbortController().signal;

describe("FixtureRepairer + capability context", () => {
  it("surfaces an infrastructure failure from run_check as InfrastructureFailure (not a red/green)", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, never, infraRunner);
    await expect(ctx.runCheck()).rejects.toBeInstanceOf(InfrastructureFailure);
  });

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

  it("rejects a write whose target file itself is a symlink out of the worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "repair-wt-"));
    const outside = await mkdtemp(join(tmpdir(), "repair-outside-"));
    dirs.push(root, outside);
    await mkdir(join(root, "src"));
    await writeFile(join(outside, "target.mjs"), "original");
    // an allowed path (src/score.mjs) whose leaf is a symlink pointing outside —
    // the parent dir is contained, so only a leaf-level check catches it.
    await symlink(join(outside, "target.mjs"), join(root, "src", "score.mjs"));
    const ctx = makeRepairContext(root, POLICY, never);
    await expect(ctx.writeFile("src/score.mjs", "pwned")).rejects.toThrow(/symlink/);
    expect(await readFile(join(outside, "target.mjs"), "utf8")).toBe("original"); // never followed
  });

  it("gates reads by allowlist and denies vcs/secret/out-of-tree paths", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, never);
    await expect(ctx.readFile(".git/config")).rejects.toThrow(/allowlist|denied/);
    await expect(ctx.readFile(".env")).rejects.toThrow(/allowlist|denied/);
    await expect(ctx.readFile("../escape")).rejects.toThrow(/escapes|allowlist/);
    expect(await ctx.readFile("src/score.mjs")).toContain("score"); // src/ is allowed
  });

  it("rejects oversized and binary file reads", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    await writeFile(join(fixture.repoRoot, "src/blob.bin"), Buffer.from([1, 2, 0, 3, 4])); // NUL → binary
    await writeFile(join(fixture.repoRoot, "src/big.txt"), "x".repeat(200));
    const ctx = makeRepairContext(fixture.repoRoot, { ...POLICY, maxReadBytes: 100 }, never);
    await expect(ctx.readFile("src/blob.bin")).rejects.toThrow(/binary/);
    await expect(ctx.readFile("src/big.txt")).rejects.toThrow(/too large/);
  });

  it("listFiles returns only allowlisted files and prunes vcs/secrets", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    await writeFile(join(fixture.repoRoot, ".env"), "SECRET=1");
    const files = await makeRepairContext(fixture.repoRoot, POLICY, never).listFiles();
    expect(files).toEqual(["src/check.mjs", "src/score.mjs"]);
  });

  it("runCheck reports the reproduction's exit code and stderr", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, never);
    const before = await ctx.runCheck(); // repoRoot HEAD = defective for the reproducible variant
    expect(before.exitCode).toBe(1);
    expect(before.stderr).toMatch(/TypeError|AssertionError/);
    await ctx.writeFile("src/score.mjs", fixture.fixedSource);
    expect((await ctx.runCheck()).exitCode).toBe(0);
  });

});

describe("repairer trust boundary", () => {
  it("trusts an exact FixtureRepairer instance", () => {
    expect(isTrustedRepairer(new FixtureRepairer("src/score.mjs", "x"))).toBe(true);
  });

  it("does NOT trust a subclass that overrides repair (no subclass backdoor)", () => {
    class EvilRepairer extends FixtureRepairer {
      override async repair(): Promise<void> {
        /* would run arbitrary generated code on a host runner */
      }
    }
    const evil = new EvilRepairer("src/score.mjs", "x");
    expect(isTrustedRepairer(evil)).toBe(false);
  });

  it("freezes the instance so repair cannot be swapped after construction", () => {
    const r = new FixtureRepairer("src/score.mjs", "x");
    expect(() => {
      (r as unknown as { repair: unknown }).repair = async () => {};
    }).toThrow(); // strict-mode assignment to a frozen object throws
    expect(isTrustedRepairer(r)).toBe(true);
  });

  it("a plain object is untrusted unless granted via the env-gated test helper", () => {
    const plain: Repairer = { async repair() {} };
    expect(isTrustedRepairer(plain)).toBe(false);
    expect(isTrustedRepairer(__trustRepairerForTest(plain))).toBe(true);
  });
});
