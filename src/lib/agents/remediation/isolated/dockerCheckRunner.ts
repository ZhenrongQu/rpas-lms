import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { CheckResult, CheckRunner } from "../substrate";

const execFileAsync = promisify(execFile);
const DOCKERFILE = "Dockerfile.remediation";
const ADAPTER_CONFIG = "vitest.adapter.config.mts";

/** The one exec the runner/builder makes — injectable so unit tests never touch a
 *  real Docker daemon. Throws with `{ code, stdout, stderr }` on a non-zero exit. */
export type DockerExec = (
  file: string,
  args: string[],
  options: { signal?: AbortSignal; maxBuffer?: number },
) => Promise<{ stdout: string; stderr: string }>;

/** A CheckRunner tagged so a guard can require isolation for untrusted authors. */
export type IsolatedCheckRunner = CheckRunner & { readonly isolated: true };

export type DockerRunnerOptions = {
  image: string;
  /** Test file(s) to run — the ONLY model-influenced input, and it comes from the
   *  fixture spec (trusted), never from the model. */
  tests: string[];
  timeoutMs?: number;
  cpus?: string;
  memoryMb?: number;
  pids?: number;
};

/**
 * Validate a vitest JSON reporter string: must be an object with testResults (Array)
 * and success (boolean), and success must agree with the exit code (0↔true, 1↔false).
 * Any deviation is treated as infrastructure noise, not a real red/green — fail-closed.
 */
function parseReport(json: string, exitCode: 0 | 1): unknown | null {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) return null;
    if (!Array.isArray(parsed.testResults)) return null;
    if (typeof parsed.success !== "boolean") return null;
    // Cross-validate: exit 0 ↔ success:true, exit 1 ↔ success:false.
    if (exitCode === 0 && !parsed.success) return null;
    if (exitCode === 1 && parsed.success) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The fixed, model-uncontrollable isolation flags for a `docker run`, up to and
 * including the image — the boundary itself. Shared by the runner and the escape
 * smoke so the smoke verifies the REAL config. Worktree is READ-ONLY; only /out
 * (report) and /tmp (tmpfs) are writable; no secrets, no network, no caps, no
 * privilege escalation, read-only rootfs, resource limits, and NO docker socket.
 */
export function isolatedDockerArgs(o: {
  name: string;
  worktreeRoot: string;
  /** Optional output bind-mount (needed for vitest JSON report; omit for script runners). */
  outDir?: string;
  image: string;
  cpus?: string;
  memoryMb?: number;
  pids?: number;
}): string[] {
  const { name, worktreeRoot, outDir, image, cpus = "1", memoryMb = 512, pids = 128 } = o;
  const args = [
    "run", "--rm", "--name", name,
    "--network", "none",
    "--read-only",
    "--tmpfs", "/tmp",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--cpus", cpus,
    "--memory", `${memoryMb}m`,
    "--pids-limit", String(pids),
    "-v", `${worktreeRoot}:/workspace/repo:ro`,
  ];
  if (outDir) args.push("-v", `${outDir}:/out`);
  args.push(
    "-w", "/workspace/repo",
    "-e", "HOME=/tmp",
    "-e", "PATH=/usr/local/bin:/usr/bin:/bin",
    image,
  );
  return args;
}

/**
 * A CheckRunner that runs the vitest check inside a locked-down Docker container —
 * the isolation boundary for UNTRUSTED, LLM-generated code. The LLM's edit already
 * landed on the host (capability write) BEFORE this runs; the container only READS
 * the worktree (mounted read-only) and runs the test, so executed code cannot touch
 * secrets, the network, the test/holdout files, git metadata, or the host. Failures
 * that are NOT a real red/green (docker error, OOM/kill, timeout, missing report)
 * return `infrastructure-failure` — fail-closed.
 */
export function dockerVitestCheckRunner(opts: DockerRunnerOptions, exec: DockerExec = execFileAsync): IsolatedCheckRunner {
  const { image, tests, timeoutMs = 120_000, cpus = "1", memoryMb = 512, pids = 128 } = opts;
  const run: CheckRunner = async (worktreeRoot, signal) => {
    const outDir = await mkdtemp(join(tmpdir(), "docker-out-"));
    const name = `remediation-${randomUUID()}`;
    const args = [
      ...isolatedDockerArgs({ name, worktreeRoot, outDir, image, cpus, memoryMb, pids }),
      "node", "/workspace/node_modules/.bin/vitest", "run", ...tests,
      "--config", ADAPTER_CONFIG, "--reporter=json", "--outputFile=/out/result.json",
    ];

    // Host-enforced timeout: abort the run and kill the container, mapped to infra.
    const ctrl = new AbortController();
    const onLeaseAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onLeaseAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
      void exec("docker", ["kill", name], {}).catch(() => {});
    }, timeoutMs);

    const readReport = () => readFile(join(outDir, "result.json"), "utf8").catch(() => null);
    try {
      await exec("docker", args, { signal: ctrl.signal, maxBuffer: 32 * 1024 * 1024 });
      // exit 0: green — but only if the report is present, structurally valid, and
      // success:true (cross-validates that vitest agrees with exit 0).
      const report = await readReport();
      if (report == null) return { kind: "infrastructure-failure", reason: "vitest produced no report (exit 0)" };
      return parseReport(report, 0) == null
        ? { kind: "infrastructure-failure", reason: "vitest report malformed or success mismatch (exit 0)" }
        : { kind: "completed", exitCode: 0, stdout: report, stderr: "" };
    } catch (e) {
      if (timedOut) return { kind: "infrastructure-failure", reason: `timeout after ${timeoutMs}ms` };
      if (signal?.aborted) throw e; // lease loss → propagate
      const err = e as { code?: number | string; stderr?: string };
      const code = typeof err.code === "number" ? err.code : -1;
      // Fail-closed: only exit 0 (success path above) and exit 1 are trusted vitest
      // signals. ALL other exit codes — docker errors (125/126/127), OOM (137), bad
      // config (2), unexpected signals — are infra, even if a partial report exists.
      if (code !== 1) {
        return { kind: "infrastructure-failure", reason: `docker exit ${code}: ${(err.stderr ?? "").slice(0, 200)}` };
      }
      // exit 1: genuine vitest failure — but only with a valid report where success:false.
      const report = await readReport();
      if (report == null) return { kind: "infrastructure-failure", reason: "no report (exit 1)" };
      return parseReport(report, 1) == null
        ? { kind: "infrastructure-failure", reason: "vitest report malformed or success mismatch (exit 1)" }
        : { kind: "completed", exitCode: 1, stdout: report, stderr: err.stderr ?? "" };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onLeaseAbort);
      await exec("docker", ["kill", name], {}).catch(() => {}); // orphan safety (no-op if --rm already removed it)
      await rm(outDir, { recursive: true, force: true }).catch(() => {});
    }
  };
  return Object.assign(run, { isolated: true as const });
}

/**
 * The isolated hidden-holdout runner: write the hidden test into the worktree ON THE
 * HOST (before the container runs), then run it in the container (worktree read-only,
 * so executed code cannot alter it). Mirrors vitestHoldoutRunner but isolated.
 */
export function dockerVitestHoldoutRunner(
  image: string,
  holdoutRelPath: string,
  holdoutSource: string,
  exec?: DockerExec,
): IsolatedCheckRunner {
  const inner = dockerVitestCheckRunner({ image, tests: [holdoutRelPath] }, exec);
  const run: CheckRunner = async (worktreeRoot, signal) => {
    await writeFile(join(worktreeRoot, holdoutRelPath), holdoutSource);
    return inner(worktreeRoot, signal);
  };
  return Object.assign(run, { isolated: true as const });
}

/**
 * Ensure the remediation image exists, building it from a MINIMAL context (only the
 * two dependency files + Dockerfile — there is no .dockerignore, so we must not send
 * the whole repo). Tagged by the pnpm-lock.yaml hash, so it is reused until deps
 * change. Returns the image tag.
 */
export async function ensureImage(originRepo: string, exec: DockerExec = execFileAsync): Promise<string> {
  // Hash all three inputs so any change to deps, package metadata, or the Dockerfile
  // itself causes a rebuild. pnpm-lock.yaml alone would miss Dockerfile edits.
  const h = createHash("sha256");
  for (const f of ["pnpm-lock.yaml", "package.json", DOCKERFILE]) {
    h.update(f + "\0").update(await readFile(join(originRepo, f)));
  }
  const tag = `remediation-vitest:${h.digest("hex").slice(0, 12)}`;
  try {
    await exec("docker", ["image", "inspect", tag], {});
    return tag; // already built
  } catch {
    /* not built → build */
  }
  const ctx = await mkdtemp(join(tmpdir(), "remediation-img-"));
  try {
    await copyFile(join(originRepo, "package.json"), join(ctx, "package.json"));
    await copyFile(join(originRepo, "pnpm-lock.yaml"), join(ctx, "pnpm-lock.yaml"));
    await copyFile(join(originRepo, DOCKERFILE), join(ctx, DOCKERFILE));
    await exec("docker", ["build", "-f", join(ctx, DOCKERFILE), "-t", tag, ctx], { maxBuffer: 64 * 1024 * 1024 });
    return tag;
  } finally {
    await rm(ctx, { recursive: true, force: true }).catch(() => {});
  }
}

export type DockerScriptRunnerOptions = {
  /** Repo-relative path to the Node.js script to execute (e.g. "src/check.mjs"). */
  script: string;
  /** Docker image with Node available. Defaults to node:20-slim (no build needed). */
  image?: string;
  timeoutMs?: number;
  cpus?: string;
  memoryMb?: number;
  pids?: number;
};

/**
 * A CheckRunner that executes a plain Node.js script inside a locked-down Docker
 * container. Simpler than `dockerVitestCheckRunner` — no JSON report, just exit code:
 * 0 = green, 1 = red, anything else = infrastructure-failure. Intended for graded
 * eval fixtures that use hand-written `.mjs` scripts rather than vitest.
 */
export function dockerScriptCheckRunner(opts: DockerScriptRunnerOptions, exec: DockerExec = execFileAsync): IsolatedCheckRunner {
  const { script, image = "node:20-slim", timeoutMs = 30_000, cpus = "1", memoryMb = 128, pids = 64 } = opts;
  const run: CheckRunner = async (worktreeRoot, signal) => {
    const name = `remediation-script-${randomUUID()}`;
    const args = [
      ...isolatedDockerArgs({ name, worktreeRoot, image, cpus, memoryMb, pids }),
      "node", `/workspace/repo/${script}`,
    ];

    const ctrl = new AbortController();
    const onLeaseAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onLeaseAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
      void exec("docker", ["kill", name], {}).catch(() => {});
    }, timeoutMs);

    try {
      await exec("docker", args, { signal: ctrl.signal });
      return { kind: "completed", exitCode: 0, stdout: "", stderr: "" };
    } catch (e) {
      if (timedOut) return { kind: "infrastructure-failure", reason: `timeout after ${timeoutMs}ms` };
      if (signal?.aborted) throw e;
      const err = e as { code?: number | string; stderr?: string };
      const code = typeof err.code === "number" ? err.code : -1;
      if (code !== 1) {
        return { kind: "infrastructure-failure", reason: `docker exit ${code}: ${(err.stderr ?? "").slice(0, 200)}` };
      }
      return { kind: "completed", exitCode: 1, stdout: "", stderr: err.stderr ?? "" };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onLeaseAbort);
      await exec("docker", ["kill", name], {}).catch(() => {});
    }
  };
  return Object.assign(run, { isolated: true as const });
}

/**
 * The hidden holdout runner for script fixtures: write the holdout source into the
 * worktree on the host, then run it inside the isolated container. Mirrors
 * `scriptHoldoutRunner` but isolated.
 */
export function dockerScriptHoldoutRunner(
  opts: Omit<DockerScriptRunnerOptions, "script"> & { holdoutSource: string; holdoutRelPath?: string },
  exec?: DockerExec,
): IsolatedCheckRunner {
  const { holdoutSource, holdoutRelPath = "src/__holdout__.mjs", ...baseOpts } = opts;
  const inner = dockerScriptCheckRunner({ ...baseOpts, script: holdoutRelPath }, exec);
  const run: CheckRunner = async (worktreeRoot, signal) => {
    await writeFile(join(worktreeRoot, holdoutRelPath), holdoutSource);
    return inner(worktreeRoot, signal);
  };
  return Object.assign(run, { isolated: true as const });
}

/** Whether a CheckRunner is the isolated (Docker) runner — used by the untrusted guard. */
export function isIsolated(runner: CheckRunner): boolean {
  return (runner as Partial<IsolatedCheckRunner>).isolated === true;
}
