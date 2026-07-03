import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expectCompleted } from "../substrate";
import { dockerVitestCheckRunner, ensureImage, type DockerExec } from "./dockerCheckRunner";

// Hermetic: NO real Docker daemon. A fake exec captures the argv and simulates the
// container outcome, writing the vitest JSON report to the bound /out dir when it
// "runs".
const PASSING = JSON.stringify({ numFailedTests: 0, success: true, testResults: [] });
const FAILING = JSON.stringify({ numFailedTests: 1, success: false, testResults: [] });

type RunBehavior = (outDir: string, options: { signal?: AbortSignal }) => Promise<{ stdout: string; stderr: string }>;

function makeExec(onRun: RunBehavior) {
  const calls: { file: string; args: string[] }[] = [];
  const exec: DockerExec = async (file, args, options) => {
    calls.push({ file, args });
    if (args[0] === "run") {
      const outMount = args.find((a) => a.endsWith(":/out"))!;
      return onRun(outMount.slice(0, -":/out".length), options);
    }
    return { stdout: "", stderr: "" }; // kill / inspect / build
  };
  return { exec, calls };
}

const green: RunBehavior = async (outDir) => {
  await writeFile(join(outDir, "result.json"), PASSING);
  return { stdout: "", stderr: "" };
};
const red: RunBehavior = async (outDir) => {
  await writeFile(join(outDir, "result.json"), FAILING);
  throw Object.assign(new Error("tests failed"), { code: 1 });
};
const dockerDown: RunBehavior = async () => {
  throw Object.assign(new Error("daemon"), { code: 125, stderr: "Cannot connect to the Docker daemon" });
};
const oom: RunBehavior = async () => {
  throw Object.assign(new Error("killed"), { code: 137 });
};
const noReport: RunBehavior = async () => ({ stdout: "", stderr: "" }); // exit 0 but wrote nothing
const hang: RunBehavior = (_outDir, options) =>
  new Promise((_res, rej) => {
    options.signal?.addEventListener("abort", () => rej(Object.assign(new Error("killed"), { code: 137 })), { once: true });
  });

describe("dockerVitestCheckRunner", () => {
  it("launches with fixed, model-uncontrollable safety args and returns the report", async () => {
    const { exec, calls } = makeExec(green);
    const runner = dockerVitestCheckRunner({ image: "img:tag", tests: ["src/lib/exam/grade.test.ts"] }, exec);
    expect(runner.isolated).toBe(true);

    const result = expectCompleted(await runner("/host/wt"));
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const run = calls.find((c) => c.args[0] === "run")!.args;
    expect(run).toEqual(
      expect.arrayContaining([
        "--network", "none",
        "--read-only",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--tmpfs", "/tmp",
        "--pids-limit",
        "--memory",
        "--cpus",
      ]),
    );
    expect(run.join(" ")).toContain("/host/wt:/workspace/repo:ro"); // worktree READ-ONLY
    expect(run).toContain("HOME=/tmp"); // env whitelist — no secrets
    expect(run.join(" ")).not.toMatch(/docker\.sock/); // Docker socket NEVER mounted
    expect(run).toContain("img:tag");
    expect(run.join(" ")).toContain("--reporter=json");
  });

  it("a genuine vitest failure with a report is a real RED (completed, exit 1)", async () => {
    const runner = dockerVitestCheckRunner({ image: "i", tests: ["t"] }, makeExec(red).exec);
    const result = expectCompleted(await runner("/wt"));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).success).toBe(false);
  });

  it("unknown exit codes (exit 2, 3, …) are infrastructure-failure even with a valid report", async () => {
    const badExit: RunBehavior = async (outDir) => {
      await writeFile(join(outDir, "result.json"), PASSING);
      throw Object.assign(new Error("bad exit"), { code: 2 });
    };
    const result = await dockerVitestCheckRunner({ image: "i", tests: ["t"] }, makeExec(badExit).exec)("/wt");
    expect(result.kind).toBe("infrastructure-failure");
  });

  it("malformed vitest report is infrastructure-failure (exit 0 or 1)", async () => {
    const malformedExit0: RunBehavior = async (outDir) => {
      await writeFile(join(outDir, "result.json"), "not valid json { {{ ");
      return { stdout: "", stderr: "" };
    };
    expect((await dockerVitestCheckRunner({ image: "i", tests: ["t"] }, makeExec(malformedExit0).exec)("/wt")).kind).toBe(
      "infrastructure-failure",
    );

    const noStructure: RunBehavior = async (outDir) => {
      await writeFile(join(outDir, "result.json"), '"just a string, no testResults"');
      return { stdout: "", stderr: "" };
    };
    expect((await dockerVitestCheckRunner({ image: "i", tests: ["t"] }, makeExec(noStructure).exec)("/wt")).kind).toBe(
      "infrastructure-failure",
    );

    const malformedExit1: RunBehavior = async (outDir) => {
      await writeFile(join(outDir, "result.json"), "not valid json");
      throw Object.assign(new Error("tests failed"), { code: 1 });
    };
    expect((await dockerVitestCheckRunner({ image: "i", tests: ["t"] }, makeExec(malformedExit1).exec)("/wt")).kind).toBe(
      "infrastructure-failure",
    );
  });

  it("fails closed: docker error / OOM / missing report / timeout are infrastructure failures", async () => {
    expect((await dockerVitestCheckRunner({ image: "i", tests: ["t"] }, makeExec(dockerDown).exec)("/wt")).kind).toBe(
      "infrastructure-failure",
    );
    expect((await dockerVitestCheckRunner({ image: "i", tests: ["t"] }, makeExec(oom).exec)("/wt")).kind).toBe(
      "infrastructure-failure",
    );
    expect((await dockerVitestCheckRunner({ image: "i", tests: ["t"] }, makeExec(noReport).exec)("/wt")).kind).toBe(
      "infrastructure-failure",
    );
    const timed = await dockerVitestCheckRunner({ image: "i", tests: ["t"], timeoutMs: 10 }, makeExec(hang).exec)("/wt");
    expect(timed.kind).toBe("infrastructure-failure");
    if (timed.kind === "infrastructure-failure") expect(timed.reason).toContain("timeout");
  });
});

describe("ensureImage", () => {
  it("returns the cached tag (lock+package.json+Dockerfile hash) without building when present", async () => {
    const calls: string[][] = [];
    const exec: DockerExec = async (_f, args) => {
      calls.push(args);
      if (args[0] === "image") return { stdout: "", stderr: "" }; // inspect ok
      throw new Error("should not build");
    };
    const tag = await ensureImage(process.cwd(), exec);
    expect(tag).toMatch(/^remediation-vitest:[0-9a-f]{12}$/);
    expect(calls.some((a) => a[0] === "build")).toBe(false);
  });

  it("builds from a minimal context (Dockerfile.remediation) when the image is missing", async () => {
    const calls: string[][] = [];
    const exec: DockerExec = async (_f, args) => {
      calls.push(args);
      if (args[0] === "image") throw new Error("No such image"); // inspect fails → build
      return { stdout: "", stderr: "" };
    };
    const tag = await ensureImage(process.cwd(), exec);
    const build = calls.find((a) => a[0] === "build")!;
    expect(build).toEqual(expect.arrayContaining(["-t", tag]));
    expect(build.some((a) => a.endsWith("Dockerfile.remediation"))).toBe(true);
  });
});
