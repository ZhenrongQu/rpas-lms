import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
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

/** docker exit codes that mean the container did not run to a trustworthy result. */
const DOCKER_INFRA_CODES = new Set([125, 126, 127, 137, 139, 143]);

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
    // Fixed, model-uncontrollable safety args. The worktree is READ-ONLY; only /out
    // (report) and /tmp (vitest cache) are writable. No secrets, no network, no caps,
    // no privilege escalation, read-only rootfs, resource limits, and — critically —
    // the Docker socket is NEVER mounted.
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
      "-v", `${outDir}:/out`,
      "-w", "/workspace/repo",
      "-e", "HOME=/tmp",
      "-e", "PATH=/usr/local/bin:/usr/bin:/bin",
      image,
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
      const report = await readReport();
      return report == null
        ? { kind: "infrastructure-failure", reason: "vitest produced no report (exit 0)" }
        : { kind: "completed", exitCode: 0, stdout: report, stderr: "" };
    } catch (e) {
      if (timedOut) return { kind: "infrastructure-failure", reason: `timeout after ${timeoutMs}ms` };
      if (signal?.aborted) throw e; // lease loss → propagate
      const err = e as { code?: number | string; stderr?: string };
      const code = typeof err.code === "number" ? err.code : 1;
      if (DOCKER_INFRA_CODES.has(code)) {
        return { kind: "infrastructure-failure", reason: `docker exit ${code}: ${(err.stderr ?? "").slice(0, 200)}` };
      }
      // A genuine vitest failure (exit 1) is a real RED — but only if it produced a report.
      const report = await readReport();
      return report == null
        ? { kind: "infrastructure-failure", reason: `no report (exit ${code})` }
        : { kind: "completed", exitCode: code, stdout: report, stderr: err.stderr ?? "" };
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
 * Ensure the remediation image exists, building it from a MINIMAL context (only the
 * two dependency files + Dockerfile — there is no .dockerignore, so we must not send
 * the whole repo). Tagged by the pnpm-lock.yaml hash, so it is reused until deps
 * change. Returns the image tag.
 */
export async function ensureImage(originRepo: string, exec: DockerExec = execFileAsync): Promise<string> {
  const lock = await readFile(join(originRepo, "pnpm-lock.yaml"), "utf8");
  const tag = `remediation-vitest:${createHash("sha256").update(lock).digest("hex").slice(0, 12)}`;
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
