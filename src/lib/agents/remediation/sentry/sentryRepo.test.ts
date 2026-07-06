import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { GitSentryRepo } from "./sentryRepo";

const run = promisify(execFile);
const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), "srepo-")); created.push(dir);
  const git = (a: string[]) => run("git", a, { cwd: dir });
  await git(["init", "-q"]); await git(["config", "user.email", "t@t.i"]); await git(["config", "user.name", "t"]);
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src/f.ts"), "export function g(x) { return x; }\n");
  await git(["add", "."]); await git(["commit", "-qm", "good"]);
  const prev = (await git(["rev-parse", "HEAD"])).stdout.trim();
  await writeFile(join(dir, "src/f.ts"), "export function g(x) { return x.y; }\n");
  await git(["add", "."]); await git(["commit", "-qm", "bad"]);
  const cur = (await git(["rev-parse", "HEAD"])).stdout.trim();
  return { dir, prev, cur };
}

describe("GitSentryRepo", () => {
  it("answers existence, ancestry, changed source files, file read, and named-export", async () => {
    const { dir, prev, cur } = await repo();
    const r = new GitSentryRepo(dir);
    expect(await r.commitExists(cur)).toBe(true);
    expect(await r.commitExists("deadbeef")).toBe(false);
    expect(await r.isAncestor(prev, cur)).toBe(true);
    expect(await r.isAncestor(cur, prev)).toBe(false);
    expect(await r.changedSourceFiles(prev, cur)).toEqual(["src/f.ts"]);
    expect(await r.fileExistsAt(cur, "src/f.ts")).toBe(true);
    expect(await r.fileExistsAt(cur, "src/none.ts")).toBe(false);
    expect(await r.readFileAt(cur, "src/f.ts")).toContain("x.y");
    expect(await r.hasNamedExport(cur, "src/f.ts", "g")).toBe(true);
    expect(await r.hasNamedExport(cur, "src/f.ts", "nope")).toBe(false);
  });
});
