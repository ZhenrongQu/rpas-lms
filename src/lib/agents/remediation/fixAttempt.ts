import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RegressionFixture } from "./fixtures";
import { makeRepairContext, type RepairPolicy, type Repairer } from "./repair";
import { matchSignature, parseFailureSignature, type FailureSignature } from "./signature";

const execFileAsync = promisify(execFile);
const CHECK = "src/check.mjs";
const PATCH_PREVIEW_BYTES = 2000;

export class LeaseLost extends Error {
  constructor() {
    super("lease lost during fix attempt");
    this.name = "LeaseLost";
  }
}

export type RepairEvidence = {
  baseCommit: string;
  reproductionHash: string;
  reproductionIntact: boolean;
  redBeforeMatches: boolean;
  redBeforeSignature: FailureSignature | null;
  greenAfter: boolean;
  changedFiles: string[];
  diffLines: number;
  hasBinaryDiff: boolean;
  patch: string; // full patch, or a bounded preview when patchTooLarge
  patchBytes: number;
  patchTooLarge: boolean;
  holdoutPassed: boolean; // a hidden correctness test passed post-repair (false-fix catcher)
};

export type Heartbeat = { intervalMs: number; beat: () => Promise<boolean> };

export type FixAttemptOptions = {
  policy: RepairPolicy;
  maxPatchBytes: number;
  heartbeat?: Heartbeat;
  /** test-only: tamper with the worktree after the repair, to prove the hash backstop. */
  _tamperCheckAfterRepair?: (worktreeRoot: string) => Promise<void>;
};

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function runCheck(worktree: string, signal: AbortSignal, file: string = CHECK): Promise<{ exitCode: number; stderr: string }> {
  try {
    await execFileAsync("node", [file], { cwd: worktree, signal });
    return { exitCode: 0, stderr: "" };
  } catch (e) {
    const err = e as { code?: number | string; stderr?: string; name?: string };
    if (signal.aborted || err.name === "AbortError" || err.code === "ABORT_ERR") throw new LeaseLost();
    return { exitCode: typeof err.code === "number" ? err.code : 1, stderr: err.stderr ?? String(e) };
  }
}

async function numstat(worktree: string): Promise<{ changedFiles: string[]; diffLines: number; hasBinaryDiff: boolean }> {
  const { stdout } = await execFileAsync("git", ["diff", "--cached", "--numstat"], { cwd: worktree });
  const changedFiles: string[] = [];
  let diffLines = 0;
  let hasBinaryDiff = false;
  for (const line of stdout.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [added, removed, ...rest] = line.split("\t");
    changedFiles.push(rest.join("\t"));
    if (added === "-" || removed === "-") hasBinaryDiff = true;
    else diffLines += (parseInt(added!, 10) || 0) + (parseInt(removed!, 10) || 0);
  }
  return { changedFiles, diffLines, hasBinaryDiff };
}

async function capturePatch(worktree: string, maxPatchBytes: number) {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--cached"], { cwd: worktree, maxBuffer: maxPatchBytes });
    return { patch: stdout, patchBytes: Buffer.byteLength(stdout), patchTooLarge: false };
  } catch (e) {
    const err = e as { code?: string; stdout?: string };
    if (err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      const partial = err.stdout ?? "";
      return {
        patch: partial.slice(0, PATCH_PREVIEW_BYTES),
        patchBytes: Buffer.byteLength(partial) || maxPatchBytes, // a lower bound; the child was killed
        patchTooLarge: true,
      };
    }
    throw e;
  }
}

/**
 * Apply a repair in an isolated worktree at the fixture's mainCommit and gather a
 * durable evidence bundle (incl. the real patch). A serial heartbeat holds the
 * lease during the attempt and aborts (kills the child, throws LeaseLost) on loss.
 * The worktree is always removed.
 */
export async function runFixAttempt(
  fixture: RegressionFixture,
  repairer: Repairer,
  opts: FixAttemptOptions,
): Promise<RepairEvidence> {
  const base = await mkdtemp(join(tmpdir(), "remediation-fix-"));
  const worktree = join(base, "wt");
  const work = new AbortController(); // aborts child processes on lease loss
  const stop = new AbortController(); // wakes the heartbeat loop on completion
  let heartbeatLoop: Promise<void> = Promise.resolve();

  try {
    await execFileAsync("git", ["worktree", "add", "--detach", worktree, fixture.mainCommit], {
      cwd: fixture.repoRoot,
    });

    if (opts.heartbeat) {
      const { intervalMs, beat } = opts.heartbeat;
      heartbeatLoop = (async () => {
        while (!stop.signal.aborted) {
          await delay(intervalMs, stop.signal);
          if (stop.signal.aborted) break;
          const held = await beat().catch(() => false);
          if (!held) { work.abort(); break; }
        }
      })();
    }

    const throwIfLost = () => { if (work.signal.aborted) throw new LeaseLost(); };

    const reproductionHash = await sha256(join(worktree, CHECK));

    const before = await runCheck(worktree, work.signal);
    throwIfLost();
    const redBeforeSignature = before.exitCode !== 0 ? parseFailureSignature(before.stderr) : null;
    const redBeforeMatches =
      before.exitCode !== 0 && !!redBeforeSignature && matchSignature(redBeforeSignature, fixture.incident) === "match";

    await repairer.repair(makeRepairContext(worktree, opts.policy, work.signal));
    throwIfLost();
    if (opts._tamperCheckAfterRepair) await opts._tamperCheckAfterRepair(worktree);

    const after = await runCheck(worktree, work.signal);
    throwIfLost();
    const greenAfter = after.exitCode === 0;

    const reproductionIntact = (await sha256(join(worktree, CHECK))) === reproductionHash;

    await execFileAsync("git", ["add", "-A"], { cwd: worktree });
    const { changedFiles, diffLines, hasBinaryDiff } = await numstat(worktree);
    const { patch, patchBytes, patchTooLarge } = await capturePatch(worktree, opts.maxPatchBytes);

    // Hidden holdout: a correctness test the repairer never saw and cannot modify,
    // injected ONLY now — after the patch is captured and git-added — so it is not
    // in the diff. Catches false-fixes that game the visible check (e.g. hardcodes).
    const holdoutRel = "src/__holdout__.mjs";
    await writeFile(join(worktree, holdoutRel), fixture.holdoutSource);
    const holdout = await runCheck(worktree, work.signal, holdoutRel);
    throwIfLost();
    const holdoutPassed = holdout.exitCode === 0;

    return {
      baseCommit: fixture.mainCommit,
      reproductionHash,
      reproductionIntact,
      redBeforeMatches,
      redBeforeSignature,
      greenAfter,
      changedFiles,
      diffLines,
      hasBinaryDiff,
      patch,
      patchBytes,
      patchTooLarge,
      holdoutPassed,
    };
  } catch (e) {
    if (work.signal.aborted) throw new LeaseLost();
    throw e;
  } finally {
    stop.abort(); // wake the heartbeat delay immediately
    await heartbeatLoop.catch(() => {});
    await execFileAsync("git", ["worktree", "remove", "--force", worktree], { cwd: fixture.repoRoot }).catch(() => {});
    await rm(base, { recursive: true, force: true }).catch(() => {});
  }
}
