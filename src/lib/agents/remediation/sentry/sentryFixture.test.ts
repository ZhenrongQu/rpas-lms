import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSentryFixture, injectingCheckRunner, type SentryFixtureSpec } from "./sentryFixture";
import type { DockerExec } from "../isolated/dockerCheckRunner";
import type { SentryRepo } from "./sentryRepo";

const tmp: string[] = [];
afterEach(async () => { await Promise.all(tmp.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

const repo = (siblingExists: boolean): SentryRepo => ({
  commitExists: async () => true, isAncestor: async () => true, changedSourceFiles: async () => [],
  fileExistsAt: async (_c, p) => (p.endsWith(".test.ts") ? siblingExists : true),
  readFileAt: async () => "", hasNamedExport: async () => true,
});

const spec: SentryFixtureSpec = {
  repoRoot: "/repo", sourceRelPath: "src/lib/exam/grade.ts", fnName: "isAnswerCorrect",
  knownGoodCommit: "prev", defectiveCommit: "cur", errorType: "TypeError", fingerprint: "TypeError:grade",
  synthesized: { relPath: "src/lib/exam/__sentry_repro__.test.ts", source: "// test", testName: "sentry repro" },
  image: "img:tag",
};

describe("buildSentryFixture", () => {
  it("wires an injecting runCheck, no-op cleanup, and single-file target", async () => {
    const fx = await buildSentryFixture(spec, repo(true));
    expect(fx.knownGoodCommit).toBe("prev");
    expect(fx.defectiveCommit).toBe("cur");
    expect(fx.mainCommit).toBe("cur");
    expect(fx.sourceRelPath).toBe("src/lib/exam/grade.ts");
    expect(fx.verificationProfile).toBe("production-black-box");
    expect(fx.substrate.pinnedPaths).toEqual([]); // re-injection protects, no pinning
    await expect(fx.cleanup()).resolves.toBeUndefined(); // no-op on the real checkout
  });

  it("chooses the placeholder holdout when no sibling test exists (distinct substrate identity)", async () => {
    const withSibling = await buildSentryFixture(spec, repo(true));
    const withoutSibling = await buildSentryFixture(spec, repo(false));
    expect(withoutSibling.substrate.identity).not.toBe(withSibling.substrate.identity);
  });
});

describe("injectingCheckRunner", () => {
  it("injects the synth test for the run and removes it afterward (never reaches the fix patch)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sfx-")); tmp.push(dir);
    const rel = "src/lib/exam/__sentry_repro__.test.ts";
    await mkdir(join(dir, "src/lib/exam"), { recursive: true });
    const PASS = JSON.stringify({ success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, testResults: [{ name: `/workspace/repo/${rel}` }] });
    let presentDuringRun: boolean | null = null;
    const exec: DockerExec = async (_file, args) => {
      const outMount = args.find((a) => a.endsWith(":/out"))!;
      presentDuringRun = existsSync(join(dir, rel)); // the synth test IS present while the check runs
      await writeFile(join(outMount.slice(0, -":/out".length), "result.json"), PASS);
      return { stdout: "", stderr: "" };
    };
    const result = await injectingCheckRunner("img:tag", rel, "// synth", exec)(dir);
    expect(result).toEqual({ kind: "completed", exitCode: 0, stdout: PASS, stderr: "" });
    expect(presentDuringRun).toBe(true);
    expect(existsSync(join(dir, rel))).toBe(false); // removed after → cannot be swept into `git add -A`
  });
});
