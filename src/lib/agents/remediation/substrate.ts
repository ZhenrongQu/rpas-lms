import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * The substrate seam: HOW a reproduction check runs, decoupled from WHETHER the
 * kernel accepts a repair. The kernel's judgment (control/defective/signature/
 * stability, verify gates, publish) is unchanged — only the check runner and the
 * failure-signature strategy are pluggable, so the same kernel drives both the
 * dependency-free `node` fixtures and a real repo's real toolchain (vitest).
 */

export type CheckResult = { exitCode: number; stdout: string; stderr: string };

/**
 * Runs a check against an already-prepared worktree. Returns a red/green result
 * WITHOUT throwing on a non-zero exit (a red check is the expected signal); THROWS
 * only on an abort, so the caller decides LeaseLost-vs-propagate.
 */
export type CheckRunner = (worktreeRoot: string, signal?: AbortSignal) => Promise<CheckResult>;

/**
 * How a failure is fingerprinted and matched to the incident. The kernel only calls
 * parse/match/serialize, so it is agnostic to the signature's SHAPE — a Node stack
 * frame (script fixtures) or a failing-test identity (real vitest). The incident is
 * baked into the strategy at construction, so `match` needs no incident argument.
 */
export interface SignatureStrategy<S = unknown> {
  /** Derive a failure signature from a red check, or null if none is recognizable. */
  parse(result: CheckResult): S | null;
  match(observed: S): "match" | "low-confidence" | "mismatch";
  /** Stable string form, for the reproduction's cross-run stability comparison. */
  serialize(observed: S): string;
}

/**
 * The default substrate: `node <relPath>` in the worktree (dependency-free ESM
 * fixtures). This is exactly the kernel's original check behavior, extracted here.
 */
export function scriptCheckRunner(relPath: string): CheckRunner {
  return async (worktreeRoot, signal) => {
    try {
      const { stdout, stderr } = await execFileAsync("node", [relPath], { cwd: worktreeRoot, signal });
      return { exitCode: 0, stdout, stderr };
    } catch (e) {
      const err = e as { code?: number | string; stdout?: string; stderr?: string; name?: string };
      if (signal?.aborted || err.name === "AbortError" || err.code === "ABORT_ERR") throw e; // abort → caller decides
      return {
        exitCode: typeof err.code === "number" ? err.code : 1,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? String(e),
      };
    }
  };
}

/**
 * A hidden-holdout runner for script fixtures: write the hidden test into the
 * worktree, then `node` it. The fix attempt calls this AFTER capturing the patch,
 * so the injected file is never in the diff (the false-fix catcher stays hidden).
 */
export function scriptHoldoutRunner(holdoutSource: string, relPath = "src/__holdout__.mjs"): CheckRunner {
  const run = scriptCheckRunner(relPath);
  return async (worktreeRoot, signal) => {
    await writeFile(join(worktreeRoot, relPath), holdoutSource);
    return run(worktreeRoot, signal);
  };
}

/**
 * Everything the kernel needs to run a fixture that is substrate-specific: HOW the
 * check + hidden holdout run, HOW a failure is fingerprinted, and WHICH paths the
 * repairer may read / must not touch. Bundled onto the fixture so the kernel reads
 * these instead of assuming `node src/check.mjs` + a Node stack signature.
 */
export type Substrate = {
  runCheck: CheckRunner;
  runHoldout: CheckRunner;
  signature: SignatureStrategy;
  /** Files the repairer must not edit (the pinned reproduction: check / test files). */
  pinnedPaths: string[];
  /** Path prefixes the repairer may read/list. */
  readAllowlist: string[];
};
