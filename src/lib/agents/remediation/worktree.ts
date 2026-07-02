import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { CheckResult, CheckRunner } from "./substrate";

const execFileAsync = promisify(execFile);

export type { CheckResult, CheckRunner } from "./substrate";

/**
 * Check out `commit` into an isolated, detached git worktree and run the given
 * `CheckRunner` there (the substrate decides HOW — `node` script, real vitest,
 * …). The runner does not throw on a red check (the expected signal). The
 * worktree is always removed, even on failure.
 */
export async function runCheckAtCommit(
  repoRoot: string,
  commit: string,
  runner: CheckRunner,
): Promise<CheckResult> {
  // mkdtemp makes the parent; git creates the worktree subdir (it must not exist).
  const base = await mkdtemp(join(tmpdir(), "remediation-worktree-"));
  const worktree = join(base, "wt");
  try {
    await execFileAsync("git", ["worktree", "add", "--detach", worktree, commit], { cwd: repoRoot });
    return await runner(worktree);
  } finally {
    await execFileAsync("git", ["worktree", "remove", "--force", worktree], { cwd: repoRoot }).catch(() => {});
    await rm(base, { recursive: true, force: true }).catch(() => {});
  }
}
