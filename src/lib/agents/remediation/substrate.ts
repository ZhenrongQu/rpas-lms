import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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

/** A check that actually ran to completion — a real red/green test signal. */
export type CompletedCheck = { kind: "completed"; exitCode: number; stdout: string; stderr: string };
/** The check could NOT be trusted to produce a red/green signal (docker missing,
 *  OOM/kill, timeout, missing report, runtime error). Fail-closed: NEVER conflate
 *  this with a real test result — an infra failure that looks like exit 1 would be
 *  a false reproduction, exit 0 a false fix. */
export type InfraFailure = { kind: "infrastructure-failure"; reason: string };
export type CheckResult = CompletedCheck | InfraFailure;

/** Thrown at a consumer boundary when a CheckRunner returns an infrastructure
 *  failure — a typed signal so the run propagates (never PROPOSED) and leaves the
 *  phase un-advanced (retriable), rather than a wrong terminal conclusion. */
export class InfrastructureFailure extends Error {
  constructor(readonly reason: string) {
    super(`check infrastructure failure: ${reason}`);
    this.name = "InfrastructureFailure";
  }
}

/** Narrow a CheckResult to a completed check, throwing InfrastructureFailure on an
 *  infra failure. Used at every boundary that reads a check's exit/output. */
export function expectCompleted(result: CheckResult): CompletedCheck {
  if (result.kind !== "completed") throw new InfrastructureFailure(result.reason);
  return result;
}

/**
 * Runs a check against an already-prepared worktree. Returns a red/green result
 * (`kind: "completed"`) WITHOUT throwing on a non-zero exit (a red check is the
 * expected signal), or `kind: "infrastructure-failure"` when it could not produce a
 * trustworthy signal; THROWS only on an abort, so the caller decides
 * LeaseLost-vs-propagate.
 */
export type CheckRunner = (worktreeRoot: string, signal?: AbortSignal) => Promise<CheckResult>;

/** Stable, serializable identity for the exact verification substrate frozen with
 *  a reproduced target. Callers supply a manifest made only from deterministic
 *  data (paths, source hashes/config, runner kind); executable closures are never
 *  treated as identity. */
export function createSubstrateIdentity(manifest: unknown): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

/**
 * How a failure is fingerprinted and matched to the incident. The kernel only calls
 * parse/match/serialize, so it is agnostic to the signature's SHAPE — a Node stack
 * frame (script fixtures) or a failing-test identity (real vitest). The incident is
 * baked into the strategy at construction, so `match` needs no incident argument.
 * `parse` only ever sees a COMPLETED check (consumers narrow infra failures first).
 */
export interface SignatureStrategy<S = unknown> {
  /** Derive a failure signature from a red check, or null if none is recognizable. */
  parse(result: CompletedCheck): S | null;
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
      return { kind: "completed", exitCode: 0, stdout, stderr };
    } catch (e) {
      const err = e as { code?: number | string; stdout?: string; stderr?: string; name?: string };
      if (signal?.aborted || err.name === "AbortError" || err.code === "ABORT_ERR") throw e; // abort → caller decides
      return {
        kind: "completed",
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
  /** Digest of the exact check/holdout/signature/runner manifest. */
  identity: string;
  runCheck: CheckRunner;
  runHoldout: CheckRunner;
  signature: SignatureStrategy;
  /** Files the repairer must not edit (the pinned reproduction: check / test files). */
  pinnedPaths: string[];
  /** Path prefixes the repairer may read/list. */
  readAllowlist: string[];
};
