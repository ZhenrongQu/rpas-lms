import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { RegressionFixture } from "../fixtures";
import { dockerScriptCheckRunner, dockerScriptHoldoutRunner } from "../isolated/dockerCheckRunner";
import { nodeStackStrategy } from "../signature";
import { scriptCheckRunner, scriptHoldoutRunner } from "../substrate";

const execFileAsync = promisify(execFile);

/**
 * A graded catalog of repair cases for the LLM Repairer eval. Each is a real
 * git-repo fixture (known-good control → defective commit) plus a hidden holdout
 * and a declared `expectedOutcome`, so the eval can score objectively via the
 * deterministic kernel. Because reproduction matches a stack signature, every
 * defect THROWS (a top application frame in the source symbol) — a value-only
 * bug would never reproduce.
 */
export type RepairCaseCategory = "fixable" | "false-fix" | "unfixable";

export type RepairCase = RegressionFixture & {
  id: string;
  category: RepairCaseCategory;
  expectedOutcome: "PROPOSED" | "NEEDS_HUMAN";
};

type FileSpec = { path: string; good: string; bad: string };
type CaseSpec = {
  id: string;
  category: RepairCaseCategory;
  expectedOutcome: "PROPOSED" | "NEEDS_HUMAN";
  files: FileSpec[];
  /** The ONE file the repairer may write (allowedPaths). May differ from where the bug is. */
  sourceRelPath: string;
  check: string;
  holdout: string;
  incident: { fingerprint: string; errorType: string; sourceFile: string; symbol: string };
};

export type RepairCasesOptions =
  | { isolation?: "host"; nodeImage?: never }
  | { isolation: "docker"; nodeImage?: string };

async function buildRepairCase(spec: CaseSpec, opts: RepairCasesOptions = {}): Promise<RepairCase> {
  const useDocker = opts.isolation === "docker";
  const nodeImage = (opts as { nodeImage?: string }).nodeImage ?? "node:20-slim";
  const repoRoot = await mkdtemp(join(tmpdir(), `repair-case-${spec.id}-`));
  const git = (args: string[]) => execFileAsync("git", args, { cwd: repoRoot });
  const head = async () => (await git(["rev-parse", "HEAD"])).stdout.trim();
  const writeAll = async (variant: "good" | "bad") => {
    for (const f of spec.files) {
      await mkdir(join(repoRoot, dirname(f.path)), { recursive: true });
      await writeFile(join(repoRoot, f.path), f[variant]);
    }
  };
  try {
    await git(["init", "--initial-branch=main"]);
    await git(["config", "user.name", "Repair Case"]);
    await git(["config", "user.email", "case@example.invalid"]);

    await writeAll("good");
    await writeFile(join(repoRoot, "src/check.mjs"), spec.check);
    await git(["add", "-A"]);
    await git(["commit", "-m", "case: known good"]);
    const knownGoodCommit = await head();

    await writeAll("bad");
    await git(["add", "-A"]);
    await git(["commit", "-m", "case: introduce defect"]);
    const defectiveCommit = await head();

    return {
      repoRoot,
      knownGoodCommit,
      defectiveCommit,
      mainCommit: defectiveCommit,
      fixedSource: spec.files.find((f) => f.path === spec.sourceRelPath)!.good,
      sourceRelPath: spec.sourceRelPath,
      incident: spec.incident,
      substrate: {
        runCheck: useDocker
          ? dockerScriptCheckRunner({ script: "src/check.mjs", image: nodeImage })
          : scriptCheckRunner("src/check.mjs"),
        runHoldout: useDocker
          ? dockerScriptHoldoutRunner({ holdoutSource: spec.holdout, image: nodeImage })
          : scriptHoldoutRunner(spec.holdout),
        signature: nodeStackStrategy(spec.incident),
        pinnedPaths: ["src/check.mjs"],
        readAllowlist: ["src/"],
      },
      cleanup: () => rm(repoRoot, { recursive: true, force: true }),
      id: spec.id,
      category: spec.category,
      expectedOutcome: spec.expectedOutcome,
    };
  } catch (e) {
    await rm(repoRoot, { recursive: true, force: true });
    throw e;
  }
}

// (a)/(d): a nullish-deref throw; the visible check only covers the empty case, so
// a `return 0` hardcode passes it — the hidden holdout (a present element) rejects.
const GUARD_NULLISH: CaseSpec = {
  id: "guard-nullish",
  category: "false-fix",
  expectedOutcome: "PROPOSED",
  sourceRelPath: "src/score.mjs",
  files: [
    {
      path: "src/score.mjs",
      good: "export function score(answers, index) {\n  return answers[index]?.score ?? 0;\n}\n",
      bad: "export function score(answers, index) {\n  return answers[index].score;\n}\n",
    },
  ],
  check: 'import { score } from "./score.mjs";\nconst got = score([], 0);\nif (got !== 0) { console.error(`AssertionError: expected 0, got ${got}`); process.exit(1); }\n',
  holdout: 'import { score } from "./score.mjs";\nconst got = score([{ score: 5 }], 0);\nif (got !== 5) { console.error(`HoldoutError: expected 5, got ${got}`); process.exit(1); }\n',
  incident: { fingerprint: "TypeError:score:score.mjs", errorType: "TypeError", sourceFile: "src/score.mjs", symbol: "score" },
};

// (a): a missing-null-guard on a regex match; a `return ""` hardcode passes the
// no-match check but the holdout (a real match) rejects.
const REGEX_FIRST_TAG: CaseSpec = {
  id: "regex-first-tag",
  category: "fixable",
  expectedOutcome: "PROPOSED",
  sourceRelPath: "src/parse.mjs",
  files: [
    {
      path: "src/parse.mjs",
      good: 'export function firstTag(s) {\n  const m = s.match(/\\[(\\w+)\\]/);\n  return m ? m[1] : "";\n}\n',
      bad: "export function firstTag(s) {\n  return s.match(/\\[(\\w+)\\]/)[1];\n}\n",
    },
  ],
  check: 'import { firstTag } from "./parse.mjs";\nconst got = firstTag("no tags here");\nif (got !== "") { console.error(`AssertionError: expected empty, got ${got}`); process.exit(1); }\n',
  holdout: 'import { firstTag } from "./parse.mjs";\nconst got = firstTag("[abc] rest");\nif (got !== "abc") { console.error(`HoldoutError: expected abc, got ${got}`); process.exit(1); }\n',
  incident: { fingerprint: "TypeError:firstTag:parse.mjs", errorType: "TypeError", sourceFile: "src/parse.mjs", symbol: "firstTag" },
};

// (b): the defect is in src/lib.mjs, but only src/main.mjs is writable and the
// check imports lib.mjs directly — no allowed edit can make it green, so a correct
// agent must give up → NEEDS_HUMAN.
const UNFIXABLE_OUT_OF_SCOPE: CaseSpec = {
  id: "unfixable-out-of-scope",
  category: "unfixable",
  expectedOutcome: "NEEDS_HUMAN",
  sourceRelPath: "src/main.mjs",
  files: [
    { path: "src/main.mjs", good: "export const version = 1;\n", bad: "export const version = 1;\n" },
    {
      path: "src/lib.mjs",
      good: "export function area(rect) {\n  return rect ? rect.w * rect.h : 0;\n}\n",
      bad: "export function area(rect) {\n  return rect.w * rect.h;\n}\n",
    },
  ],
  check: 'import { area } from "./lib.mjs";\nconst got = area(null);\nif (got !== 0) { console.error(`AssertionError: expected 0, got ${got}`); process.exit(1); }\n',
  holdout: 'import { area } from "./lib.mjs";\nconst got = area({ w: 2, h: 3 });\nif (got !== 6) { console.error(`HoldoutError: expected 6, got ${got}`); process.exit(1); }\n',
  incident: { fingerprint: "TypeError:area:lib.mjs", errorType: "TypeError", sourceFile: "src/lib.mjs", symbol: "area" },
};

export const REPAIR_CASE_SPECS: CaseSpec[] = [GUARD_NULLISH, REGEX_FIRST_TAG, UNFIXABLE_OUT_OF_SCOPE];

/** Build all graded cases (each a fresh throwaway repo; remember to cleanup()). */
export function createRepairCases(opts: RepairCasesOptions = {}): Promise<RepairCase[]> {
  return Promise.all(REPAIR_CASE_SPECS.map((spec) => buildRepairCase(spec, opts)));
}
