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
 * Validate that a JSON string is a parseable vitest reporter object (has testResults).
 * Any exit code that produced a structurally invalid report is treated as infra, not
 * a real red — fail-closed.
 */
function parseReport(json: string): unknown | null {
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null && "testResults" in parsed ? parsed : null;
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
  outDir: string;
  image: string;
  cpus?: string;
  memoryMb?: number;
  pids?: number;
}): string[] {
  const { name, worktreeRoot, outDir, image, cpus = "1", memoryMb = 512, pids = 128 } = o;
  return [
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
    "-v", `${outDir}:/out`,
    "-w", "/workspace/repo",
    "-e", "HOME=/tmp",
    "-e", "PATH=/usr/local/bin:/usr/bin:/bin",
    image,
  ];
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
      // exit 0: green — but only if the report is present and structurally valid.
      const report = await readReport();
      if (report == null) return { kind: "infrastructure-failure", reason: "vitest produced no report (exit 0)" };
      return parseReport(report) == null
        ? { kind: "infrastructure-failure", reason: "vitest report malformed (exit 0)" }
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
      // exit 1: genuine vitest failure — but only with a valid report.
      const report = await readReport();
      if (report == null) return { kind: "infrastructure-failure", reason: "no report (exit 1)" };
      return parseReport(report) == null
        ? { kind: "infrastructure-failure", reason: "vitest report malformed (exit 1)" }
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

/** Whether a CheckRunner is the isolated (Docker) runner — used by the untrusted guard. */
export function isIsolated(runner: CheckRunner): boolean {
  return (runner as Partial<IsolatedCheckRunner>).isolated === true;
}
