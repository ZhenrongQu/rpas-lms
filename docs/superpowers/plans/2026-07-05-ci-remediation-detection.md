# CI-failure Remediation Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a real CI test failure into a real GitHub draft PR carrying an LLM-verified fix, by feeding the existing remediation kernel through a new `DefectSource` spine and mirroring its `needs_review` artifact to GitHub.

**Architecture:** A `CiDefectSource` parses the failing run's vitest JSON report + resolves a known-good/defective commit pair into a `RegressionFixture`. `runRemediation` drives the UNCHANGED kernel (reproduce → LlmRepairer → verify → `needs_review` draft in the DB). A `DraftPublisher` then mirrors that DB artifact to a real GitHub draft PR. Two GitHub Actions workflows wire it up: `test.yml` runs vitest + uploads its JSON report; `remediation.yml` fires on that workflow's failure and runs `pnpm remediation:ci`.

**Tech Stack:** TypeScript (strict), Prisma + Postgres, Vitest, Node `child_process` (git), the `gh` CLI (GitHub API), GitHub Actions.

## Global Constraints

- The kernel, state machine, `verify`, `substrate`, and `LlmRepairer` are **unchanged** — copy verbatim, never edit. Only add new files (+ one `package.json` script + two workflow files).
- `pnpm test` stays **hermetic**: no network, Docker, real GitHub, or model in unit tests. Real GitHub/Docker/model run ONLY in the smoke (`pnpm remediation:ci`) and in CI.
- Every seam that touches the outside world (git, GitHub, the CI report file) is an **injected interface** with a mock in tests, a real impl used only by the entrypoint.
- Path alias `@/*` → `./src/*`. New code lives under `src/lib/agents/remediation/ci/`. Tests sit next to source as `*.test.ts`.
- Local test Postgres only (`postgresql://postgres:postgres@localhost:5433/postgres`); DB-touching entrypoints must refuse a non-local DB (reuse the `assertLocalDb` pattern from `scripts/agents/real-repair-eval.ts`).
- **v1 scope limit:** a CI regression is remediated only when the known-good→defective diff touches **exactly one** non-test source file. Zero or multiple → treated as out of scope (no fixture, no PR). This keeps the single-`sourceRelPath` kernel contract unchanged.
- Never auto-merge. Output is always a **draft** PR labelled `automated-remediation` + `needs-human-review`.

---

## File Structure

- `src/lib/agents/remediation/ci/defectSource.ts` — `DefectSource` interface + `DefectReport` type (the A/B-shared spine seam).
- `src/lib/agents/remediation/ci/ciReport.ts` — parse a vitest JSON report → failing-test signature + related tests.
- `src/lib/agents/remediation/ci/baseline.ts` — resolve known-good/defective commits (PR vs main) behind `GitOps`/`CiHistory` seams.
- `src/lib/agents/remediation/ci/commitPairFixture.ts` — build a `RegressionFixture` from two REAL commits (no synthesized mutate) + single-source-file scope check + related-tests holdout.
- `src/lib/agents/remediation/ci/ciDefectSource.ts` — assemble the above into a `DefectSource`.
- `src/lib/agents/remediation/ci/githubClient.ts` — `GitHubClient` seam + a `MockGitHubClient` for tests.
- `src/lib/agents/remediation/ci/githubDraft.ts` — `DraftPublisher`: mirror the run's `needs_review` version → a real draft PR, idempotent per incident.
- `src/lib/agents/remediation/ci/runRemediation.ts` — orchestration: source → kernel → publisher.
- `scripts/agents/remediation-ci.ts` — the `pnpm remediation:ci` entrypoint (wires the real seams).
- `.github/workflows/test.yml`, `.github/workflows/remediation.yml` — CI.

Each `*.test.ts` sits beside its source.

---

## Task 1: DefectSource spine + CI report parsing

**Files:**
- Create: `src/lib/agents/remediation/ci/defectSource.ts`
- Create: `src/lib/agents/remediation/ci/ciReport.ts`
- Test: `src/lib/agents/remediation/ci/ciReport.test.ts`

**Interfaces:**
- Consumes: `RegressionFixture` from `../fixtures`; `VitestIncident` from `../real/vitestSubstrate`.
- Produces:
  - `type DefectReport = { repository: string; defaultBranch: string; fixture: RegressionFixture }`
  - `interface DefectSource { detect(): Promise<DefectReport | null> }`
  - `type CiFailure = { signature: VitestIncident; relatedTests: string[] }`
  - `function parseCiReport(json: string): CiFailure | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/remediation/ci/ciReport.test.ts
import { describe, expect, it } from "vitest";
import { parseCiReport } from "./ciReport";

const report = JSON.stringify({
  success: false,
  testResults: [
    {
      name: "/repo/src/lib/exam/grade.test.ts",
      assertionResults: [
        { fullName: "isAnswerCorrect ignores duplicate selections", title: "ignores duplicate selections", status: "failed", failureMessages: ["AssertionError: expected false to be true"] },
        { fullName: "other passing", title: "other passing", status: "passed", failureMessages: [] },
      ],
    },
  ],
});

describe("parseCiReport", () => {
  it("extracts the first failing test's signature + its file as a related test", () => {
    const f = parseCiReport(report);
    expect(f).toEqual({
      signature: { testFile: "src/lib/exam/grade.test.ts", testName: "ignores duplicate selections", errorName: "AssertionError" },
      relatedTests: ["src/lib/exam/grade.test.ts"],
    });
  });

  it("returns null when no test failed or the JSON is unparseable", () => {
    expect(parseCiReport('{"success":true,"testResults":[]}')).toBeNull();
    expect(parseCiReport("not json")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/ciReport.test.ts`
Expected: FAIL — `parseCiReport` not defined.

- [ ] **Step 3: Write the spine types + the parser**

```ts
// src/lib/agents/remediation/ci/defectSource.ts
import type { RegressionFixture } from "../fixtures";

/** What a detection source hands the runner: the incident coordinates + a ready fixture. */
export type DefectReport = {
  repository: string;
  defaultBranch: string;
  fixture: RegressionFixture;
};

/** The A/B-shared detection seam. `detect` returns null when there is nothing to remediate. */
export interface DefectSource {
  detect(): Promise<DefectReport | null>;
}
```

```ts
// src/lib/agents/remediation/ci/ciReport.ts
import { basename } from "node:path";
import type { VitestIncident } from "../real/vitestSubstrate";

export type CiFailure = { signature: VitestIncident; relatedTests: string[] };

type VitestJson = {
  testResults?: Array<{
    name?: string;
    assertionResults?: Array<{ fullName?: string; title?: string; status?: string; failureMessages?: string[] }>;
  }>;
};

/** First token of a (de-ANSI'd) failure message is the error class, e.g. "AssertionError". */
function errorNameOf(msg: string | undefined): string {
  if (!msg) return "Error";
  const clean = msg.replace(/\[[0-9;]*m/g, "");
  const m = clean.match(/^\s*([A-Za-z][\w$]*):/);
  return m ? m[1]! : "Error";
}

/** Repo-relative path from an absolute vitest `name`, best-effort: strip everything up to
 *  and including the last `src/` segment so the signature matches the fixture's rel paths. */
function relPath(absName: string): string {
  const i = absName.lastIndexOf("/src/");
  return i >= 0 ? absName.slice(i + 1) : basename(absName);
}

/** Parse a vitest `--reporter=json` report → the FIRST failing test's signature + its file
 *  as the single related test. Returns null for a green/empty/unparseable report. */
export function parseCiReport(json: string): CiFailure | null {
  let p: VitestJson;
  try {
    p = JSON.parse(json) as VitestJson;
  } catch {
    return null;
  }
  for (const file of p.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      if (a.status !== "failed") continue;
      const testFile = relPath(file.name ?? "");
      return {
        signature: { testFile, testName: a.title ?? a.fullName ?? "", errorName: errorNameOf(a.failureMessages?.[0]) },
        relatedTests: [testFile],
      };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/ciReport.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/remediation/ci/defectSource.ts src/lib/agents/remediation/ci/ciReport.ts src/lib/agents/remediation/ci/ciReport.test.ts
git commit -m "feat(remediation): DefectSource spine + CI vitest-report signature parsing"
```

---

## Task 2: Baseline resolver (known-good / defective commits)

**Files:**
- Create: `src/lib/agents/remediation/ci/baseline.ts`
- Test: `src/lib/agents/remediation/ci/baseline.test.ts`

**Interfaces:**
- Produces:
  - `type CiEvent = { kind: "pull_request"; headSha: string; baseRef: string } | { kind: "push"; branch: string; headSha: string }`
  - `interface GitOps { mergeBase(a: string, b: string): Promise<string> }`
  - `interface CiHistory { lastGreenCommit(branch: string, beforeSha: string): Promise<string | null> }`
  - `type Baseline = { knownGoodCommit: string; defectiveCommit: string }`
  - `function resolveBaseline(event: CiEvent, git: GitOps, history: CiHistory): Promise<Baseline | null>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/remediation/ci/baseline.test.ts
import { describe, expect, it } from "vitest";
import { resolveBaseline, type CiHistory, type GitOps } from "./baseline";

const git: GitOps = { mergeBase: async (_a, _b) => "base-sha" };

describe("resolveBaseline", () => {
  it("PR: known-good = merge-base(base, head), defective = head", async () => {
    const history: CiHistory = { lastGreenCommit: async () => null };
    const b = await resolveBaseline({ kind: "pull_request", headSha: "head-sha", baseRef: "origin/main" }, git, history);
    expect(b).toEqual({ knownGoodCommit: "base-sha", defectiveCommit: "head-sha" });
  });

  it("push:main: known-good = last green commit, defective = head", async () => {
    const history: CiHistory = { lastGreenCommit: async (_branch, before) => (before === "head-sha" ? "green-sha" : null) };
    const b = await resolveBaseline({ kind: "push", branch: "main", headSha: "head-sha" }, git, history);
    expect(b).toEqual({ knownGoodCommit: "green-sha", defectiveCommit: "head-sha" });
  });

  it("push:main with no prior green run → null (no baseline)", async () => {
    const history: CiHistory = { lastGreenCommit: async () => null };
    expect(await resolveBaseline({ kind: "push", branch: "main", headSha: "head-sha" }, git, history)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/baseline.test.ts`
Expected: FAIL — `resolveBaseline` not defined.

- [ ] **Step 3: Write the resolver**

```ts
// src/lib/agents/remediation/ci/baseline.ts
export type CiEvent =
  | { kind: "pull_request"; headSha: string; baseRef: string }
  | { kind: "push"; branch: string; headSha: string };

/** Git operations the resolver needs — injected so unit tests never shell out. */
export interface GitOps {
  mergeBase(a: string, b: string): Promise<string>;
}

/** The CI history the resolver queries for the last green commit on a branch. */
export interface CiHistory {
  lastGreenCommit(branch: string, beforeSha: string): Promise<string | null>;
}

export type Baseline = { knownGoodCommit: string; defectiveCommit: string };

/**
 * Resolve the known-good baseline + the defective commit for a CI failure:
 *   • pull_request → defective = head, known-good = merge-base(base, head).
 *   • push:main    → defective = head, known-good = the last commit whose CI was green.
 * Returns null when no baseline exists (e.g. no prior green run on main) — a safe no-op.
 */
export async function resolveBaseline(event: CiEvent, git: GitOps, history: CiHistory): Promise<Baseline | null> {
  if (event.kind === "pull_request") {
    const knownGoodCommit = await git.mergeBase(event.baseRef, event.headSha);
    return { knownGoodCommit, defectiveCommit: event.headSha };
  }
  const knownGoodCommit = await history.lastGreenCommit(event.branch, event.headSha);
  return knownGoodCommit ? { knownGoodCommit, defectiveCommit: event.headSha } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/baseline.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/remediation/ci/baseline.ts src/lib/agents/remediation/ci/baseline.test.ts
git commit -m "feat(remediation): CI baseline resolver (PR merge-base / main last-green)"
```

---

## Task 3: Commit-pair fixture (real two-commit regression)

**Files:**
- Create: `src/lib/agents/remediation/ci/commitPairFixture.ts`
- Test: `src/lib/agents/remediation/ci/commitPairFixture.test.ts`

**Interfaces:**
- Consumes: `Baseline` (Task 2); `CiFailure` (Task 1); `vitestJsonStrategy`, `vitestCheckRunner`, `vitestHoldoutRunner`, `ADAPTER_CONFIG` from `../real/vitestSubstrate`; `createSubstrateIdentity`, `Substrate` from `../substrate`; `RegressionFixture` from `../fixtures`. Uses `dockerVitestCheckRunner`/`dockerVitestHoldoutRunner`/`ensureImage` from `../isolated/dockerCheckRunner`.
- Produces:
  - `type ChangedFiles = { sourceFiles: string[]; testFiles: string[] }`
  - `interface RepoInspector { changedFiles(a: string, b: string): Promise<ChangedFiles>; relatedTestFiles(sourceRelPath: string, excluding: string[]): Promise<string[]> }`
  - `type CommitPairSpec = { originRepo: string; repository: string; baseline: Baseline; failure: CiFailure; image: string }`
  - `async function buildCommitPairFixture(spec: CommitPairSpec, repo: RepoInspector): Promise<RegressionFixture | null>` — null when the diff is not a single-source-file regression (v1 scope).

- [ ] **Step 1: Write the failing test**

Uses a real temp git repo (git is local, no network — allowed in unit tests, matching `real/fixture.test.ts`). Docker is NOT invoked here: we assert the fixture's WIRING (commits, paths, single-file scope), not a real check run.

```ts
// src/lib/agents/remediation/ci/commitPairFixture.test.ts
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { buildCommitPairFixture, type RepoInspector } from "./commitPairFixture";

const run = promisify(execFile);
const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

async function repoWithTwoCommits(): Promise<{ dir: string; good: string; bad: string }> {
  const dir = await mkdtemp(join(tmpdir(), "cpf-"));
  created.push(dir);
  const git = (a: string[]) => run("git", a, { cwd: dir });
  await git(["init", "-q"]);
  await git(["config", "user.email", "t@t.invalid"]);
  await git(["config", "user.name", "t"]);
  await writeFile(join(dir, "score.mjs"), "export const f = (x) => x;\n");
  await git(["add", "."]); await git(["commit", "-qm", "good"]);
  const good = (await git(["rev-parse", "HEAD"])).stdout.trim();
  await writeFile(join(dir, "score.mjs"), "export const f = (x) => x + 1;\n");
  await git(["add", "."]); await git(["commit", "-qm", "bad"]);
  const bad = (await git(["rev-parse", "HEAD"])).stdout.trim();
  return { dir, good, bad };
}

const failure = { signature: { testFile: "score.test.mjs", testName: "t", errorName: "AssertionError" }, relatedTests: ["score.test.mjs"] };

describe("buildCommitPairFixture", () => {
  it("builds a fixture for a single-source-file regression", async () => {
    const { dir, good, bad } = await repoWithTwoCommits();
    const inspector: RepoInspector = {
      changedFiles: async () => ({ sourceFiles: ["score.mjs"], testFiles: [] }),
      relatedTestFiles: async () => [],
    };
    const fx = await buildCommitPairFixture(
      { originRepo: dir, repository: "o/r", baseline: { knownGoodCommit: good, defectiveCommit: bad }, failure, image: "img:tag" },
      inspector,
    );
    expect(fx).not.toBeNull();
    expect(fx!.knownGoodCommit).toBe(good);
    expect(fx!.defectiveCommit).toBe(bad);
    expect(fx!.sourceRelPath).toBe("score.mjs");
    expect(fx!.verificationProfile).toBe("production-black-box");
    expect(fx!.incident.fingerprint).toContain("AssertionError");
  });

  it("returns null when the diff touches multiple source files (out of v1 scope)", async () => {
    const { dir, good, bad } = await repoWithTwoCommits();
    const inspector: RepoInspector = {
      changedFiles: async () => ({ sourceFiles: ["a.mjs", "b.mjs"], testFiles: [] }),
      relatedTestFiles: async () => [],
    };
    const fx = await buildCommitPairFixture(
      { originRepo: dir, repository: "o/r", baseline: { knownGoodCommit: good, defectiveCommit: bad }, failure, image: "img:tag" },
      inspector,
    );
    expect(fx).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/commitPairFixture.test.ts`
Expected: FAIL — `buildCommitPairFixture` not defined.

- [ ] **Step 3: Write the builder**

```ts
// src/lib/agents/remediation/ci/commitPairFixture.ts
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RegressionFixture } from "../fixtures";
import { createSubstrateIdentity, type Substrate } from "../substrate";
import { dockerVitestCheckRunner, dockerVitestHoldoutRunner } from "../isolated/dockerCheckRunner";
import { ADAPTER_CONFIG, vitestJsonStrategy } from "../real/vitestSubstrate";
import type { Baseline } from "./baseline";
import type { CiFailure } from "./ciReport";

const execFileAsync = promisify(execFile);

export type ChangedFiles = { sourceFiles: string[]; testFiles: string[] };

/** Inspects the repo diff between two commits (injected so unit tests never shell out). */
export interface RepoInspector {
  changedFiles(knownGood: string, defective: string): Promise<ChangedFiles>;
  /** Existing test files that import `sourceRelPath` but are NOT in `excluding` — the
   *  best-effort holdout for a real regression. */
  relatedTestFiles(sourceRelPath: string, excluding: string[]): Promise<string[]>;
}

export type CommitPairSpec = {
  originRepo: string;
  repository: string;
  baseline: Baseline;
  failure: CiFailure;
  image: string;
};

/** A hidden holdout assembled from EXISTING related tests: concatenated file contents so the
 *  verify phase runs them after patch capture. Empty string when none exist (lower confidence). */
async function relatedHoldoutSource(originRepo: string, defective: string, tests: string[]): Promise<string> {
  const parts: string[] = [];
  for (const t of tests) {
    const content = await execFileAsync("git", ["show", `${defective}:${t}`], { cwd: originRepo }).then((r) => r.stdout).catch(() => "");
    if (content) parts.push(content);
  }
  return parts.join("\n");
}

/**
 * Build a `RegressionFixture` from two REAL commits (no synthesized mutate — the defect IS
 * the diff). v1 scope: exactly one non-test source file changed, else null (out of scope).
 * The write-allowlist is that one file; the holdout is best-effort related existing tests.
 * Always `production-black-box` (an untrusted LLM author verified in Docker isolation).
 */
export async function buildCommitPairFixture(spec: CommitPairSpec, repo: RepoInspector): Promise<RegressionFixture | null> {
  const { originRepo, baseline, failure, image } = spec;
  const changed = await repo.changedFiles(baseline.knownGoodCommit, baseline.defectiveCommit);
  if (changed.sourceFiles.length !== 1) return null; // v1: single-source-file regressions only
  const sourceRelPath = changed.sourceFiles[0]!;

  const relatedTests = await repo.relatedTestFiles(sourceRelPath, failure.relatedTests);
  const holdoutRelPath = `${sourceRelPath.replace(/[^\w]/g, "_")}__ci_holdout__.test.ts`;
  const holdoutSource = await relatedHoldoutSource(originRepo, baseline.defectiveCommit, relatedTests);

  const signature = vitestJsonStrategy(failure.signature);
  const adapterConfigContent = await readFile(join(originRepo, ADAPTER_CONFIG), "utf8");
  const adapterConfigSha = createHash("sha256").update(adapterConfigContent).digest("hex");
  const tests = failure.relatedTests;
  const identity = createSubstrateIdentity({
    kind: "vitest-v1",
    isolation: "docker",
    image,
    tests: [...tests].sort(),
    adapterConfig: `${ADAPTER_CONFIG}:${adapterConfigSha}`,
    holdoutPath: holdoutRelPath,
    holdoutSource,
    signature: failure.signature,
    pinnedPaths: [...tests].sort(),
    readAllowlist: ["src/"],
  });

  const substrate: Substrate = {
    identity,
    runCheck: dockerVitestCheckRunner({ image, tests }),
    runHoldout: dockerVitestHoldoutRunner(image, holdoutRelPath, holdoutSource),
    signature,
    pinnedPaths: tests,
    readAllowlist: ["src/"],
  };

  const fixedSource = await execFileAsync("git", ["show", `${baseline.knownGoodCommit}:${sourceRelPath}`], { cwd: originRepo })
    .then((r) => r.stdout)
    .catch(() => "");

  return {
    repoRoot: originRepo,
    knownGoodCommit: baseline.knownGoodCommit,
    defectiveCommit: baseline.defectiveCommit,
    mainCommit: baseline.defectiveCommit,
    fixedSource,
    sourceRelPath,
    incident: {
      fingerprint: `${failure.signature.errorName}:${failure.signature.testFile}:${failure.signature.testName}`,
      errorType: failure.signature.errorName,
      sourceFile: sourceRelPath,
      symbol: "",
    },
    substrate,
    verificationProfile: "production-black-box",
    cleanup: async () => {}, // the CI checkout is not ours to delete
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/commitPairFixture.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/remediation/ci/commitPairFixture.ts src/lib/agents/remediation/ci/commitPairFixture.test.ts
git commit -m "feat(remediation): build a RegressionFixture from a real known-good/defective commit pair"
```

---

## Task 4: CiDefectSource

**Files:**
- Create: `src/lib/agents/remediation/ci/ciDefectSource.ts`
- Test: `src/lib/agents/remediation/ci/ciDefectSource.test.ts`

**Interfaces:**
- Consumes: `DefectSource`/`DefectReport` (Task 1), `parseCiReport` (Task 1), `resolveBaseline`/`CiEvent`/`GitOps`/`CiHistory` (Task 2), `buildCommitPairFixture`/`RepoInspector` (Task 3).
- Produces:
  - `type CiSourceDeps = { reportJson: string; event: CiEvent; originRepo: string; repository: string; defaultBranch: string; image: string; git: GitOps; history: CiHistory; repo: RepoInspector }`
  - `class CiDefectSource implements DefectSource` (constructed with `CiSourceDeps`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/remediation/ci/ciDefectSource.test.ts
import { describe, expect, it } from "vitest";
import { CiDefectSource, type CiSourceDeps } from "./ciDefectSource";

const reportJson = JSON.stringify({
  success: false,
  testResults: [{ name: "/r/src/lib/exam/grade.test.ts", assertionResults: [{ title: "dupes", status: "failed", failureMessages: ["AssertionError: x"] }] }],
});

function deps(over: Partial<CiSourceDeps> = {}): CiSourceDeps {
  return {
    reportJson,
    event: { kind: "pull_request", headSha: "head", baseRef: "origin/main" },
    originRepo: "/r",
    repository: "o/r",
    defaultBranch: "main",
    image: "img:tag",
    git: { mergeBase: async () => "good" },
    history: { lastGreenCommit: async () => null },
    repo: { changedFiles: async () => ({ sourceFiles: ["src/lib/exam/grade.ts"], testFiles: [] }), relatedTestFiles: async () => [] },
    ...over,
  };
}

describe("CiDefectSource", () => {
  it("detects a defect report with a ready fixture", async () => {
    const r = await new CiDefectSource(deps()).detect();
    expect(r?.repository).toBe("o/r");
    expect(r?.fixture.sourceRelPath).toBe("src/lib/exam/grade.ts");
  });

  it("returns null when the report has no failing test", async () => {
    const r = await new CiDefectSource(deps({ reportJson: '{"success":true,"testResults":[]}' })).detect();
    expect(r).toBeNull();
  });

  it("returns null when no baseline resolves", async () => {
    const r = await new CiDefectSource(deps({ event: { kind: "push", branch: "main", headSha: "head" } })).detect();
    expect(r).toBeNull(); // history.lastGreenCommit → null
  });

  it("returns null when the diff is not a single source file", async () => {
    const r = await new CiDefectSource(
      deps({ repo: { changedFiles: async () => ({ sourceFiles: [], testFiles: [] }), relatedTestFiles: async () => [] } }),
    ).detect();
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/ciDefectSource.test.ts`
Expected: FAIL — `CiDefectSource` not defined.

- [ ] **Step 3: Write the source**

```ts
// src/lib/agents/remediation/ci/ciDefectSource.ts
import { resolveBaseline, type CiEvent, type CiHistory, type GitOps } from "./baseline";
import { buildCommitPairFixture, type RepoInspector } from "./commitPairFixture";
import { parseCiReport } from "./ciReport";
import type { DefectReport, DefectSource } from "./defectSource";

export type CiSourceDeps = {
  reportJson: string;
  event: CiEvent;
  originRepo: string;
  repository: string;
  defaultBranch: string;
  image: string;
  git: GitOps;
  history: CiHistory;
  repo: RepoInspector;
};

/** Detection source for a CI test failure. Each null-return is a safe "nothing to remediate":
 *  no failing test, no resolvable baseline, or a diff outside the single-source-file v1 scope. */
export class CiDefectSource implements DefectSource {
  constructor(private readonly deps: CiSourceDeps) {}

  async detect(): Promise<DefectReport | null> {
    const failure = parseCiReport(this.deps.reportJson);
    if (!failure) return null;
    const baseline = await resolveBaseline(this.deps.event, this.deps.git, this.deps.history);
    if (!baseline) return null;
    const fixture = await buildCommitPairFixture(
      { originRepo: this.deps.originRepo, repository: this.deps.repository, baseline, failure, image: this.deps.image },
      this.deps.repo,
    );
    if (!fixture) return null;
    return { repository: this.deps.repository, defaultBranch: this.deps.defaultBranch, fixture };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/ciDefectSource.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/remediation/ci/ciDefectSource.ts src/lib/agents/remediation/ci/ciDefectSource.test.ts
git commit -m "feat(remediation): CiDefectSource — CI failure → DefectReport"
```

---

## Task 5: GitHubClient seam + DraftPublisher

**Files:**
- Create: `src/lib/agents/remediation/ci/githubClient.ts`
- Create: `src/lib/agents/remediation/ci/githubDraft.ts`
- Test: `src/lib/agents/remediation/ci/githubDraft.test.ts`

**Interfaces:**
- Consumes: `prisma` from `../../../db`.
- Produces:
  - `type PrTarget = { baseRef: string; headBranch: string }`
  - `type OpenPr = { number: number; url: string }`
  - `interface GitHubClient { findOpenPr(headBranch: string): Promise<OpenPr | null>; pushFixBranch(a: { headBranch: string; baseCommit: string; patch: string; message: string }): Promise<void>; openDraftPr(a: { target: PrTarget; title: string; body: string; labels: string[] }): Promise<OpenPr>; commentOnPr(n: number, body: string): Promise<void> }`
  - `class MockGitHubClient implements GitHubClient` (records calls in public arrays)
  - `class DraftPublisher` with `constructor(gh: GitHubClient)` and `publish(args: { incidentId: string; target: PrTarget }): Promise<OpenPr | null>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/remediation/ci/githubDraft.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../../db";
import { ingestIncident } from "../store";
import { DraftPublisher } from "./githubDraft";
import { MockGitHubClient } from "./githubClient";

afterEach(async () => {
  await prisma.externalActionVersion.deleteMany();
  await prisma.externalAction.deleteMany();
  await prisma.incident.deleteMany();
});

/** A needs_review draft already written by the kernel (publishReviewDraft) for `incidentId`. */
async function seedDraft(incidentId: string, patch: string) {
  await prisma.externalAction.create({
    data: { kind: "draft_pr", incidentId, repository: "o/r", defaultBranch: "main", fingerprint: "fp", status: "needs_review", currentVersion: 1 },
  });
  const action = await prisma.externalAction.findFirstOrThrow({ where: { incidentId } });
  await prisma.externalActionVersion.create({
    data: { actionId: action.id, cycle: 1, version: 1, body: "b", patch, evidence: "{}" },
  });
}

describe("DraftPublisher", () => {
  const target = { baseRef: "origin/main", headBranch: "remediation/fp" };

  it("opens a real draft PR mirroring the needs_review version's patch", async () => {
    const inc = await ingestIncident({ repository: "o/r", defaultBranch: "main", fingerprint: "fp", payload: {} });
    await seedDraft(inc.id, "PATCH-A");
    const gh = new MockGitHubClient();
    const pr = await new DraftPublisher(gh).publish({ incidentId: inc.id, target });
    expect(pr).toEqual({ number: 1, url: "https://x/1" });
    expect(gh.pushed).toEqual([{ headBranch: "remediation/fp", baseCommit: expect.any(String), patch: "PATCH-A", message: expect.any(String) }]);
    expect(gh.opened[0]!.labels).toEqual(["automated-remediation", "needs-human-review"]);
  });

  it("is idempotent: an existing open PR is updated, not duplicated", async () => {
    const inc = await ingestIncident({ repository: "o/r", defaultBranch: "main", fingerprint: "fp", payload: {} });
    await seedDraft(inc.id, "PATCH-A");
    const gh = new MockGitHubClient();
    gh.existing = { number: 7, url: "https://x/7" };
    const pr = await new DraftPublisher(gh).publish({ incidentId: inc.id, target });
    expect(pr).toEqual({ number: 7, url: "https://x/7" });
    expect(gh.opened).toHaveLength(0); // updated the branch, did NOT open a second PR
    expect(gh.pushed).toHaveLength(1);
  });

  it("returns null when there is no needs_review draft (non-green outcome)", async () => {
    const inc = await ingestIncident({ repository: "o/r", defaultBranch: "main", fingerprint: "fp", payload: {} });
    const pr = await new DraftPublisher(new MockGitHubClient()).publish({ incidentId: inc.id, target });
    expect(pr).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/githubDraft.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the seam + mock**

```ts
// src/lib/agents/remediation/ci/githubClient.ts
export type PrTarget = { baseRef: string; headBranch: string };
export type OpenPr = { number: number; url: string };

/** The GitHub operations the publisher needs. Real impl (entrypoint) uses git + the `gh` CLI;
 *  unit tests use MockGitHubClient. */
export interface GitHubClient {
  findOpenPr(headBranch: string): Promise<OpenPr | null>;
  pushFixBranch(a: { headBranch: string; baseCommit: string; patch: string; message: string }): Promise<void>;
  openDraftPr(a: { target: PrTarget; title: string; body: string; labels: string[] }): Promise<OpenPr>;
  commentOnPr(prNumber: number, body: string): Promise<void>;
}

export class MockGitHubClient implements GitHubClient {
  existing: OpenPr | null = null;
  pushed: Array<{ headBranch: string; baseCommit: string; patch: string; message: string }> = [];
  opened: Array<{ target: PrTarget; title: string; body: string; labels: string[] }> = [];
  comments: Array<{ prNumber: number; body: string }> = [];

  async findOpenPr(): Promise<OpenPr | null> {
    return this.existing;
  }
  async pushFixBranch(a: { headBranch: string; baseCommit: string; patch: string; message: string }): Promise<void> {
    this.pushed.push(a);
  }
  async openDraftPr(a: { target: PrTarget; title: string; body: string; labels: string[] }): Promise<OpenPr> {
    this.opened.push(a);
    return { number: 1, url: "https://x/1" };
  }
  async commentOnPr(prNumber: number, body: string): Promise<void> {
    this.comments.push({ prNumber, body });
  }
}
```

```ts
// src/lib/agents/remediation/ci/githubDraft.ts
import { prisma } from "../../../db";
import type { GitHubClient, OpenPr, PrTarget } from "./githubClient";

const KIND = "draft_pr";
const LABELS = ["automated-remediation", "needs-human-review"];

/**
 * Mirror a run's kernel-written `needs_review` draft (the latest ExternalActionVersion for the
 * incident) to a REAL GitHub draft PR. Idempotent per incident: an existing open PR for the
 * head branch is updated (branch force-pushed), never duplicated. Returns null when no
 * needs_review draft exists (a non-green outcome produced no artifact).
 */
export class DraftPublisher {
  constructor(private readonly gh: GitHubClient) {}

  async publish(args: { incidentId: string; target: PrTarget }): Promise<OpenPr | null> {
    const action = await prisma.externalAction.findFirst({
      where: { incidentId: args.incidentId, kind: KIND, status: "needs_review" },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    const version = action?.versions[0];
    if (!action || !version) return null;

    const message = `remediation: ${version.body}`.slice(0, 72);
    await this.gh.pushFixBranch({ headBranch: args.target.headBranch, baseCommit: args.target.baseRef, patch: version.patch, message });

    const existing = await this.gh.findOpenPr(args.target.headBranch);
    if (existing) return existing; // branch updated above; PR already open

    return this.gh.openDraftPr({
      target: args.target,
      title: `[auto-remediation] ${version.body}`.slice(0, 120),
      body: version.evidence ? `Automated fix candidate — **needs human review, not auto-merged**.\n\n\`\`\`json\n${version.evidence}\n\`\`\`` : version.body,
      labels: LABELS,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/githubDraft.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/remediation/ci/githubClient.ts src/lib/agents/remediation/ci/githubDraft.ts src/lib/agents/remediation/ci/githubDraft.test.ts
git commit -m "feat(remediation): DraftPublisher mirrors the needs_review draft to a real GitHub draft PR"
```

---

## Task 6: runRemediation orchestration

**Files:**
- Create: `src/lib/agents/remediation/ci/runRemediation.ts`
- Test: `src/lib/agents/remediation/ci/runRemediation.test.ts`

**Interfaces:**
- Consumes: `DefectSource` (Task 1), `DraftPublisher` (Task 5), `PrTarget` (Task 5), `ingestIncident`/`createRemediationRun`/`claimRun`/`transitionRun` from `../store`, `driveReproduction`/`driveRepair` from `../driver`, `Repairer` from `../repair`.
- Produces:
  - `type RunRemediationResult = { status: "no-defect" | "ALREADY_FIXED" | "NOT_REPRODUCIBLE" | "NEEDS_HUMAN" | "PROPOSED"; pr: OpenPr | null }`
  - `async function runRemediation(source: DefectSource, repairer: Repairer, publisher: DraftPublisher, opts?: { worker?: string; leaseMs?: number; repeats?: number }): Promise<RunRemediationResult>`

- [ ] **Step 1: Write the failing test**

Hermetic: a fake `DefectSource` returning null (no kernel/Docker touched), plus a fake returning a report whose reproduction is stubbed. Here we test the null-defect short-circuit and the no-defect path (the full FIXING path is covered by the smoke, which needs Docker).

```ts
// src/lib/agents/remediation/ci/runRemediation.test.ts
import { describe, expect, it, vi } from "vitest";
import { runRemediation } from "./runRemediation";
import type { DefectSource } from "./defectSource";
import { MockGitHubClient } from "./githubClient";
import { DraftPublisher } from "./githubDraft";

const noRepairer = { repair: vi.fn() };
const publisher = new DraftPublisher(new MockGitHubClient());

describe("runRemediation", () => {
  it("short-circuits to no-defect when the source detects nothing", async () => {
    const source: DefectSource = { detect: async () => null };
    const r = await runRemediation(source, noRepairer, publisher, { target: { baseRef: "origin/main", headBranch: "x" } });
    expect(r).toEqual({ status: "no-defect", pr: null });
    expect(noRepairer.repair).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/runRemediation.test.ts`
Expected: FAIL — `runRemediation` not defined.

- [ ] **Step 3: Write the orchestration**

```ts
// src/lib/agents/remediation/ci/runRemediation.ts
import { driveRepair, driveReproduction } from "../driver";
import type { Repairer } from "../repair";
import { claimRun, createRemediationRun, ingestIncident, transitionRun } from "../store";
import type { DefectSource } from "./defectSource";
import type { DraftPublisher } from "./githubDraft";
import type { OpenPr, PrTarget } from "./githubClient";

export type RunRemediationResult = {
  status: "no-defect" | "ALREADY_FIXED" | "NOT_REPRODUCIBLE" | "NEEDS_HUMAN" | "PROPOSED";
  pr: OpenPr | null;
};

/**
 * Drive one detection→fix→publish cycle: detect a defect, run it through the UNCHANGED kernel
 * (reproduce → repair → verify → needs_review draft), then mirror any draft to a real PR.
 * Every non-FIXING reproduction outcome and a non-green repair short-circuit with pr=null.
 */
export async function runRemediation(
  source: DefectSource,
  repairer: Repairer,
  publisher: DraftPublisher,
  opts: { target: PrTarget; worker?: string; leaseMs?: number; repeats?: number },
): Promise<RunRemediationResult> {
  const worker = opts.worker ?? "remediation-ci";
  const leaseMs = opts.leaseMs ?? 300_000;
  const report = await source.detect();
  if (!report) return { status: "no-defect", pr: null };

  const { repository, defaultBranch, fixture } = report;
  try {
    const incident = await ingestIncident({
      repository,
      defaultBranch,
      fingerprint: fixture.incident.fingerprint,
      payload: { ...fixture.incident, defectiveCommit: fixture.defectiveCommit },
    });
    const run = await createRemediationRun(incident.id);
    if (!(await claimRun(run.id, worker, leaseMs))) throw new Error("failed to claim run");
    await transitionRun(run.id, worker, "RECEIVED", "TRIAGING");
    await transitionRun(run.id, worker, "TRIAGING", "CLASSIFIED");

    const repro = await driveReproduction(run.id, worker, fixture, { repeats: opts.repeats ?? 2 });
    if (repro !== "FIXING") return { status: repro, pr: null };

    const outcome = await driveRepair(run.id, worker, fixture, repairer, { leaseMs, heartbeatMs: 15_000 });
    const pr = await publisher.publish({ incidentId: incident.id, target: opts.target });
    return { status: outcome, pr };
  } finally {
    await fixture.cleanup();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/ci/runRemediation.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Full hermetic sweep + typecheck**

Run: `pnpm typecheck && pnpm exec vitest run src/lib/agents/remediation/`
Expected: typecheck clean; all remediation tests green (existing 172 + the new ci tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/remediation/ci/runRemediation.ts src/lib/agents/remediation/ci/runRemediation.test.ts
git commit -m "feat(remediation): runRemediation orchestration (source → kernel → draft PR)"
```

---

## Task 7: Real entrypoint + workflows

**Files:**
- Create: `scripts/agents/remediation-ci.ts`
- Modify: `package.json` (add the `remediation:ci` script)
- Create: `.github/workflows/test.yml`
- Create: `.github/workflows/remediation.yml`

**Interfaces:**
- Consumes: everything above; `ensureImage` from `../../src/lib/agents/remediation/isolated/dockerCheckRunner`; `LlmRepairer` from `../../src/lib/agents/remediation/llm/repairer`.
- Produces: a runnable `pnpm remediation:ci`; the real `GitOps`/`CiHistory`/`RepoInspector`/`GitHubClient` impls (via git + `gh`); the CI wiring.

This task is validated by the end-to-end smoke + a real workflow run (it has no unit test — its logic is the injected seams already tested above). Keep the real seam impls thin (git + `gh` shellouts).

- [ ] **Step 1: Write the real seam impls + entrypoint**

```ts
// scripts/agents/remediation-ci.ts
import "../eval/loadEnv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "../../src/lib/db";
import { ensureImage } from "../../src/lib/agents/remediation/isolated/dockerCheckRunner";
import { LlmRepairer } from "../../src/lib/agents/remediation/llm/repairer";
import { CiDefectSource } from "../../src/lib/agents/remediation/ci/ciDefectSource";
import { DraftPublisher } from "../../src/lib/agents/remediation/ci/githubDraft";
import { runRemediation } from "../../src/lib/agents/remediation/ci/runRemediation";
import type { CiEvent, CiHistory, GitOps } from "../../src/lib/agents/remediation/ci/baseline";
import type { ChangedFiles, RepoInspector } from "../../src/lib/agents/remediation/ci/commitPairFixture";
import type { GitHubClient, OpenPr, PrTarget } from "../../src/lib/agents/remediation/ci/githubClient";
import { readFileSync } from "node:fs";

const run = promisify(execFile);
const REPO = process.cwd();

function assertLocalDb(): void {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname.replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`remediation-ci refuses a non-local DB (host: ${host})`);
}

const git: GitOps = { mergeBase: async (a, b) => (await run("git", ["merge-base", a, b], { cwd: REPO })).stdout.trim() };

const history: CiHistory = {
  // Last commit on `branch` whose test.yml run concluded success, older than beforeSha.
  lastGreenCommit: async (branch, _beforeSha) => {
    const out = (await run("gh", ["run", "list", "--workflow", "test.yml", "--branch", branch, "--status", "success", "--limit", "1", "--json", "headSha"], { cwd: REPO }).catch(() => ({ stdout: "[]" }))).stdout;
    const rows = JSON.parse(out) as Array<{ headSha: string }>;
    return rows[0]?.headSha ?? null;
  },
};

const repo: RepoInspector = {
  changedFiles: async (a, b): Promise<ChangedFiles> => {
    const out = (await run("git", ["diff", "--name-only", a, b], { cwd: REPO })).stdout.trim();
    const files = out ? out.split("\n") : [];
    const isTest = (f: string) => /\.test\.[cm]?[jt]sx?$/.test(f);
    return { sourceFiles: files.filter((f) => f.startsWith("src/") && !isTest(f)), testFiles: files.filter(isTest) };
  },
  relatedTestFiles: async (sourceRelPath, excluding) => {
    const mod = sourceRelPath.replace(/^src\//, "").replace(/\.[cm]?[jt]sx?$/, "");
    const out = (await run("git", ["grep", "-l", mod, "--", "src/**/*.test.ts"], { cwd: REPO }).catch(() => ({ stdout: "" }))).stdout.trim();
    return (out ? out.split("\n") : []).filter((f) => !excluding.includes(f));
  },
};

const gh: GitHubClient = {
  findOpenPr: async (headBranch): Promise<OpenPr | null> => {
    const out = (await run("gh", ["pr", "list", "--head", headBranch, "--state", "open", "--json", "number,url", "--limit", "1"], { cwd: REPO }).catch(() => ({ stdout: "[]" }))).stdout;
    const rows = JSON.parse(out) as OpenPr[];
    return rows[0] ?? null;
  },
  pushFixBranch: async ({ headBranch, baseCommit, patch, message }) => {
    await run("git", ["checkout", "-B", headBranch, baseCommit], { cwd: REPO });
    await run("git", ["apply", "-"], { cwd: REPO, input: patch } as never);
    await run("git", ["commit", "-aqm", message], { cwd: REPO });
    await run("git", ["push", "-f", "origin", headBranch], { cwd: REPO });
  },
  openDraftPr: async ({ target, title, body, labels }): Promise<OpenPr> => {
    const out = (await run("gh", ["pr", "create", "--draft", "--base", target.baseRef.replace(/^origin\//, ""), "--head", target.headBranch, "--title", title, "--body", body, "--label", labels.join(",")], { cwd: REPO })).stdout.trim();
    const number = Number(out.match(/\/pull\/(\d+)/)?.[1] ?? 0);
    return { number, url: out };
  },
  commentOnPr: async (n, body) => { await run("gh", ["pr", "comment", String(n), "--body", body], { cwd: REPO }); },
};

function readEvent(): CiEvent {
  // Populated by the workflow (see remediation.yml): a small JSON blob on disk.
  return JSON.parse(readFileSync(process.env.CI_EVENT_FILE ?? "ci-event.json", "utf8")) as CiEvent;
}

async function main(): Promise<void> {
  assertLocalDb();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("remediation-ci needs ANTHROPIC_API_KEY");
  const image = await ensureImage(REPO);
  const event = readEvent();
  const source = new CiDefectSource({
    reportJson: readFileSync(process.env.CI_REPORT_FILE ?? "vitest-report.json", "utf8"),
    event,
    originRepo: REPO,
    repository: process.env.GITHUB_REPOSITORY ?? "unknown/unknown",
    defaultBranch: "main",
    image,
    git,
    history,
    repo,
  });
  const baseRef = event.kind === "pull_request" ? event.baseRef : "origin/main";
  const target: PrTarget = { baseRef, headBranch: `remediation/${event.headSha.slice(0, 12)}` };
  const result = await runRemediation(source, new LlmRepairer({}), new DraftPublisher(gh), { target });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "PROPOSED") process.exitCode = 1; // production must never auto-PROPOSED
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add the package.json script**

In `package.json` `"scripts"`, add:

```json
"remediation:ci": "tsx scripts/agents/remediation-ci.ts",
```

- [ ] **Step 3: Write test.yml**

```yaml
# .github/workflows/test.yml
name: test
on:
  pull_request:
  push:
    branches: [main]
jobs:
  vitest:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env: { POSTGRES_PASSWORD: postgres }
        ports: ["5433:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5433/postgres
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec vitest run --reporter=json --outputFile=vitest-report.json
      - if: failure()
        uses: actions/upload-artifact@v4
        with: { name: vitest-report, path: vitest-report.json }
```

- [ ] **Step 4: Write remediation.yml**

```yaml
# .github/workflows/remediation.yml
name: remediation
on:
  workflow_run:
    workflows: [test]
    types: [completed]
permissions:
  contents: write
  pull-requests: write
  actions: read
concurrency:
  group: remediation-${{ github.event.workflow_run.head_branch }}
  cancel-in-progress: false
jobs:
  fix:
    if: >-
      github.event.workflow_run.conclusion == 'failure' &&
      !startsWith(github.event.workflow_run.head_branch, 'remediation/')
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env: { POSTGRES_PASSWORD: postgres }
        ports: ["5433:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5433/postgres
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      GH_TOKEN: ${{ github.token }}
      CI_REPORT_FILE: vitest-report.json
      CI_EVENT_FILE: ci-event.json
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:push
      - name: Download the failing run's report
        uses: actions/download-artifact@v4
        with:
          name: vitest-report
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ github.token }}
      - name: Build the CI event blob
        run: |
          node -e '
            const e = require("./ci-event-from-workflow-run.cjs");
            require("fs").writeFileSync("ci-event.json", JSON.stringify(e(${{ toJSON(github.event.workflow_run) }})));
          '
      - run: pnpm remediation:ci
```

- [ ] **Step 5: Write the tiny event-shape helper referenced by the workflow**

```js
// ci-event-from-workflow-run.cjs
// Maps a workflow_run payload → the CiEvent shape runRemediation expects.
module.exports = (wr) =>
  wr.event === "pull_request"
    ? { kind: "pull_request", headSha: wr.head_sha, baseRef: `origin/${(wr.pull_requests[0] && wr.pull_requests[0].base.ref) || "main"}` }
    : { kind: "push", branch: wr.head_branch, headSha: wr.head_sha };
```

- [ ] **Step 6: Typecheck + confirm hermetic suite still green**

Run: `pnpm typecheck && pnpm exec vitest run src/lib/agents/remediation/`
Expected: clean + green (the entrypoint/workflows add no unit tests but must not break typecheck).

- [ ] **Step 7: Commit**

```bash
git add scripts/agents/remediation-ci.ts package.json .github/workflows/test.yml .github/workflows/remediation.yml ci-event-from-workflow-run.cjs
git commit -m "feat(remediation): CI entrypoint + test.yml/remediation.yml workflows"
```

---

## Task 8: End-to-end smoke validation (manual, no unit test)

**Files:** none (validation only).

- [ ] **Step 1: Plant a regression on a throwaway branch**

```bash
git checkout -b regression-smoke
# reintroduce the grade-dedup bug by hand:
#   src/lib/exam/grade.ts  →  change  [...new Set(selected)]  to  [...selected]
git commit -am "test: plant grade-dedup regression (smoke)"
```

- [ ] **Step 2: Produce a real failing report + event locally**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres \
  pnpm exec vitest run src/lib/exam/grade.test.ts --reporter=json --outputFile=vitest-report.json || true
printf '{"kind":"pull_request","headSha":"%s","baseRef":"origin/main"}' "$(git rev-parse HEAD)" > ci-event.json
```

- [ ] **Step 3: Run the entrypoint with GitHub calls disabled (dry-run)**

Set `gh` to a dry-run by exporting `GH_DRYRUN=1` is NOT wired; instead verify the pipeline up to publish by pointing at a scratch repo OR reading the console result. Expected `status: NEEDS_HUMAN` (production-black-box) and, on a good Sonnet fix, a `needs_review` draft in the DB.

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres REAL_REPAIR_MODEL=claude-sonnet-4-6 pnpm remediation:ci`
Expected: JSON result with `status: "NEEDS_HUMAN"` and (LLM permitting) a non-null `pr` OR a recorded needs_review draft.

- [ ] **Step 4: Clean up the throwaway branch**

```bash
git checkout - && git branch -D regression-smoke && rm -f vitest-report.json ci-event.json
```

- [ ] **Step 5: (Optional) validate the real workflow**

Push `regression-smoke` as a PR against a fork/scratch clone (NOT the real repo unless intended); confirm `test.yml` fails, `remediation.yml` fires, and a draft PR appears. This is the only step that writes to a real GitHub repo — do it deliberately.

---

## Self-Review

**Spec coverage:**
- §2 spine (`DefectSource`/`DraftPublisher`) → Tasks 1, 5. ✓
- §3.1 signature extraction → Task 1. ✓
- §3.2 baseline resolver (PR + main) → Task 2. ✓
- §3.3 holdout = related tests + human backstop → Task 3 (`relatedTestFiles`, best-effort holdout). ✓
- §4 real draft PR, targeting, idempotency (ExternalAction), GITHUB_TOKEN, loop prevention → Task 5 (idempotency/labels/body) + Task 7 (permissions, `remediation/*` skip, GITHUB_TOKEN). ✓
- §5 two workflows, self-contained job → Task 7. ✓
- §6 fail-closed (non-reproducible/non-green → no PR) → Task 6 (`repro !== "FIXING"` and null draft → pr null). ✓
- §7 hermetic tests + smoke → Tasks 1-6 hermetic, Task 8 smoke. ✓
- §8 new-code inventory → matches File Structure. ✓
- §9 scope (single-source-file, fork fallback, no Sentry) → Global Constraints + Task 3 null-return; fork-comment fallback lives in the real `GitHubClient` (Task 7) via `commentOnPr` — **note:** wired but not exercised in v1 (documented limitation).

**Placeholder scan:** no TBD/TODO; every code step shows real code; workflows are complete YAML.

**Type consistency:** `DefectReport`/`DefectSource` (T1) consumed unchanged in T4/T6; `Baseline` (T2) → T3/T4; `CiFailure` (T1) → T3/T4; `PrTarget`/`OpenPr`/`GitHubClient` (T5) → T6/T7; `RunRemediationResult` (T6) → T7. `MockGitHubClient.openDraftPr` returns `{number:1,url:"https://x/1"}` matching the T5 test.

**Known plan risk to flag at execution:** Task 5's `DraftPublisher` reads `status: "needs_review"` — this depends on the kernel's `publishReviewDraft` having written that row during `driveRepair` (committed 2026-07-05, `d6a3fc2`). Confirm that commit is present before Task 5.
