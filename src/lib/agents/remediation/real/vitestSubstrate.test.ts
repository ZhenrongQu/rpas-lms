import { afterEach, describe, expect, it } from "vitest";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vitestCheckRunner, vitestJsonStrategy, type VitestExec } from "./vitestSubstrate";

// Hermetic: NO real vitest is spawned. The JSON strategy is fed sample reporter
// output; the runner is driven by a fake exec that writes a canned result file.
const FAILING_JSON = JSON.stringify({
  numFailedTests: 1,
  testResults: [
    {
      name: "/tmp/wt/src/lib/exam/grade.test.ts",
      status: "failed",
      assertionResults: [
        {
          fullName: "isAnswerCorrect matches an exact multi-select set",
          title: "matches an exact multi-select set",
          status: "failed",
          failureMessages: ["AssertionError: expected false to be true // Object.is equality\n    at grade.test.ts:9:31"],
        },
        { fullName: "isAnswerCorrect rejects a subset", title: "rejects a subset", status: "passed", failureMessages: [] },
      ],
    },
  ],
  success: false,
});

const PASSING_JSON = JSON.stringify({
  numFailedTests: 0,
  testResults: [{ name: "/tmp/wt/src/lib/exam/grade.test.ts", status: "passed", assertionResults: [{ status: "passed" }] }],
  success: true,
});

const incident = {
  testFile: "src/lib/exam/grade.test.ts",
  testName: "isAnswerCorrect matches an exact multi-select set",
  errorName: "AssertionError",
};

describe("vitestJsonStrategy", () => {
  const strat = vitestJsonStrategy(incident);

  it("fingerprints the first failing test and matches the incident", () => {
    const observed = strat.parse({ exitCode: 1, stdout: FAILING_JSON, stderr: "" })!;
    expect(observed).toEqual({
      testFile: "grade.test.ts",
      testName: "isAnswerCorrect matches an exact multi-select set",
      errorName: "AssertionError",
    });
    expect(strat.match(observed)).toBe("match");
  });

  it("mismatches on a different error class or a different failing test", () => {
    const observed = strat.parse({ exitCode: 1, stdout: FAILING_JSON, stderr: "" })!;
    expect(vitestJsonStrategy({ ...incident, errorName: "TypeError" }).match(observed)).toBe("mismatch");
    expect(vitestJsonStrategy({ ...incident, testName: "some other test" }).match(observed)).toBe("mismatch");
  });

  it("returns null on a green report or unparseable stdout", () => {
    expect(strat.parse({ exitCode: 0, stdout: PASSING_JSON, stderr: "" })).toBeNull();
    expect(strat.parse({ exitCode: 1, stdout: "not json", stderr: "" })).toBeNull();
  });
});

describe("vitestCheckRunner", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("symlinks node_modules, invokes vitest with the adapter config, and returns the JSON report", async () => {
    const origin = await mkdtemp(join(tmpdir(), "origin-"));
    const base = await mkdtemp(join(tmpdir(), "base-"));
    const worktree = join(base, "wt");
    await mkdir(worktree);
    dirs.push(origin, base);
    await mkdir(join(origin, "node_modules"));

    const calls: { file: string; args: string[] }[] = [];
    const fakeExec: VitestExec = async (file, args) => {
      calls.push({ file, args });
      const out = args.find((a) => a.startsWith("--outputFile="))!.slice("--outputFile=".length);
      await writeFile(out, FAILING_JSON); // vitest writes the report even when tests fail
      const err = new Error("tests failed") as Error & { code: number };
      err.code = 1; // vitest exits non-zero on failure
      throw err;
    };

    const runner = vitestCheckRunner(origin, ["src/lib/exam/grade.test.ts"], fakeExec);
    const result = await runner(worktree);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).numFailedTests).toBe(1); // report read back from the temp file
    // node_modules is linked in the worktree's PARENT (outside the git worktree)
    expect(calls[0]!.file).toBe(join(base, "node_modules", ".bin", "vitest"));
    expect(calls[0]!.args).toEqual(
      expect.arrayContaining(["run", "src/lib/exam/grade.test.ts", "--config", "vitest.adapter.config.mts", "--reporter=json"]),
    );
    await expect(access(join(base, "node_modules"))).resolves.toBeUndefined(); // symlink created in the parent
    await expect(access(join(worktree, "node_modules"))).rejects.toThrow(); // NOT inside the worktree
  });
});
