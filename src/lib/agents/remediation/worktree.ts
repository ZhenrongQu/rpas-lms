import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CheckResult = { exitCode: number; stdout: string; stderr: string };

/**
 * Check out `commit` into an isolated, detached git worktree and run
 * `node <checkRelPath>` there, capturing the result without throwing on a
 * non-zero exit (a red check is the expected signal). The worktree is always
 * removed, even on failure.
 */
export async function runCheckAtCommit(
  repoRoot: string,
  commit: string,
  checkRelPath: string,
): Promise<CheckResult> {
  // mkdtemp makes the parent; git creates the worktree subdir (it must not exist).
  const base = await mkdtemp(join(tmpdir(), "remediation-worktree-"));
  const worktree = join(base, "wt");
  try {
    await execFileAsync("git", ["worktree", "add", "--detach", worktree, commit], { cwd: repoRoot });
    try {
      const { stdout, stderr } = await execFileAsync("node", [checkRelPath], { cwd: worktree });
      return { exitCode: 0, stdout, stderr };
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string };
      return {
        exitCode: typeof err.code === "number" ? err.code : 1,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? String(e),
      };
    }
  } finally {
    await execFileAsync("git", ["worktree", "remove", "--force", worktree], { cwd: repoRoot }).catch(() => {});
    await rm(base, { recursive: true, force: true }).catch(() => {});
  }
}
