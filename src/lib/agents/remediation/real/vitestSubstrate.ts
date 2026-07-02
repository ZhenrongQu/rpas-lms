import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import type { CheckResult, CheckRunner, SignatureStrategy } from "../substrate";

const execFileAsync = promisify(execFile);
const ADAPTER_CONFIG = "vitest.adapter.config.mts";

/** The one exec the runner makes — injectable so unit tests never spawn real vitest. */
export type VitestExec = (
  file: string,
  args: string[],
  options: { cwd: string; signal?: AbortSignal; maxBuffer?: number },
) => Promise<{ stdout: string; stderr: string }>;

/** Link the origin's node_modules at `depsDir` (idempotent). depsDir is the
 *  worktree's PARENT (a private temp dir): node resolution walks up and finds it,
 *  but `git add -A` inside the worktree never sees it — a node_modules SYMLINK at
 *  the worktree root is not matched by a `node_modules/` gitignore, so it would
 *  otherwise pollute the repair diff and trip the path-policy gate. */
async function ensureNodeModules(originRepo: string, depsDir: string): Promise<void> {
  try {
    await access(depsDir);
    return; // already present
  } catch {
    /* absent → create */
  }
  await symlink(join(originRepo, "node_modules"), depsDir, "dir");
}

/**
 * A real-toolchain CheckRunner: run the given vitest test file(s) against the
 * worktree via the adapter config (no globalSetup / no DB) and return vitest's JSON
 * reporter output as CheckResult.stdout. The JSON is written to a temp file OUTSIDE
 * the worktree, so it never pollutes the repair's diff; node_modules is symlinked
 * from the origin repo into the worktree's temp parent (NOT the worktree itself,
 * so it stays out of the diff). A red check (tests fail) is a non-zero exit, not a
 * throw; only an abort throws. Assumes the worktree's parent is a private temp dir
 * (both kernel call sites create the worktree as `<mkdtemp>/wt`).
 */
export function vitestCheckRunner(
  originRepo: string,
  tests: string[],
  exec: VitestExec = execFileAsync,
): CheckRunner {
  return async (worktreeRoot, signal) => {
    const depsDir = join(dirname(worktreeRoot), "node_modules");
    await ensureNodeModules(originRepo, depsDir);
    const outDir = await mkdtemp(join(tmpdir(), "vitest-out-"));
    const outFile = join(outDir, "result.json");
    const vitestBin = join(depsDir, ".bin", "vitest");
    const args = ["run", ...tests, "--config", ADAPTER_CONFIG, "--reporter=json", `--outputFile=${outFile}`];
    try {
      await exec(vitestBin, args, { cwd: worktreeRoot, signal, maxBuffer: 32 * 1024 * 1024 });
      return { exitCode: 0, stdout: await readFile(outFile, "utf8").catch(() => ""), stderr: "" };
    } catch (e) {
      const err = e as { code?: number | string; stderr?: string; name?: string };
      if (signal?.aborted || err.name === "AbortError" || err.code === "ABORT_ERR") throw e;
      return {
        exitCode: typeof err.code === "number" ? err.code : 1,
        stdout: await readFile(outFile, "utf8").catch(() => ""),
        stderr: err.stderr ?? String(e),
      };
    } finally {
      await rm(outDir, { recursive: true, force: true }).catch(() => {});
    }
  };
}

/**
 * A hidden-holdout runner for real fixtures: write the hidden test file into the
 * worktree, then run vitest on it. Called AFTER patch capture (by the fix attempt),
 * so the injected test is never in the diff — and it is absent during repair, so
 * the repairer (which may read src/) never sees it.
 */
export function vitestHoldoutRunner(
  originRepo: string,
  holdoutRelPath: string,
  holdoutSource: string,
  exec?: VitestExec,
): CheckRunner {
  const run = vitestCheckRunner(originRepo, [holdoutRelPath], exec);
  return async (worktreeRoot, signal) => {
    await writeFile(join(worktreeRoot, holdoutRelPath), holdoutSource);
    return run(worktreeRoot, signal);
  };
}

/** A failing-test identity — the real-repo analogue of a stack signature. Value-only
 *  bugs (assertion failures) are fingerprintable this way; they need not throw. */
export type VitestSignature = { testFile: string; testName: string; errorName: string };
export type VitestIncident = { testFile: string; testName: string; errorName: string };

type VitestJson = {
  testResults?: Array<{
    name?: string;
    assertionResults?: Array<{ fullName?: string; title?: string; status?: string; failureMessages?: string[] }>;
  }>;
};

/** First token of a (de-ANSI'd) failure message is the error class, e.g. "AssertionError". */
function errorNameOf(msg: string | undefined): string {
  if (!msg) return "Error";
  const clean = msg.replace(/\[[0-9;]*m/g, "");
  const m = clean.match(/^\s*([A-Za-z][\w$]*):/);
  return m ? m[1]! : "Error";
}

/** The real-vitest signature strategy: fingerprint the FIRST failing test from the
 *  JSON reporter output and match it against the incident's declared failing test. */
export function vitestJsonStrategy(incident: VitestIncident): SignatureStrategy<VitestSignature> {
  return {
    parse: (result: CheckResult) => {
      let json: VitestJson;
      try {
        json = JSON.parse(result.stdout) as VitestJson;
      } catch {
        return null;
      }
      for (const file of json.testResults ?? []) {
        for (const a of file.assertionResults ?? []) {
          if (a.status === "failed") {
            return {
              testFile: basename(file.name ?? ""),
              testName: a.fullName ?? a.title ?? "",
              errorName: errorNameOf(a.failureMessages?.[0]),
            };
          }
        }
      }
      return null;
    },
    match: (observed) => {
      if (basename(incident.testFile) !== observed.testFile) return "mismatch";
      if (incident.errorName !== observed.errorName) return "mismatch";
      if (incident.testName && observed.testName) {
        // Tolerate vitest reporting fullName ("describe > it") vs the leaf title:
        // declaring the leaf still matches either form.
        const named = observed.testName === incident.testName || observed.testName.endsWith(incident.testName);
        return named ? "match" : "mismatch";
      }
      return "low-confidence"; // file + error match, but a test name is missing on one side
    },
    serialize: (observed) => JSON.stringify(observed),
  };
}
