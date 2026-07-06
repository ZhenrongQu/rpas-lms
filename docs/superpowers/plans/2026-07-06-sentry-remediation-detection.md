# Sentry-error Remediation Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a (fixture) Sentry production error into a real GitHub draft PR by triaging it, LLM-synthesizing a reproducing test, and driving the unchanged kernel + the sub-project-1 spine.

**Architecture:** A Sentry orchestration layer triages each issue (regression-shaped + in-app frame in `src/` + single changed source file + synthesizable error class + named-export target); a reproducing test is LLM-synthesized as a bounded literal **call expression** (host generates the path/import/name); the injected test drives the kernel (reproduce→repair→verify→needs_review draft) via `runRemediation`; `DraftPublisher` mirrors it to a draft PR. Escalations are structured records emitted by the orchestration, not the kernel.

**Tech Stack:** TypeScript (strict), the `typescript` compiler API (AST validation), Prisma + Postgres, Vitest, Docker (isolated vitest), Anthropic SDK (via the runtime `MessageCreator` seam), git + `gh` (reused from sub-project 1).

## Global Constraints

- Kernel, state machine, `verify`, `substrate`, `LlmRepairer`, and the sub-project-1 spine (`ci/runRemediation.ts`, `ci/githubDraft.ts`, `ci/githubClient.ts`, `ci/defectSource.ts`) are **unchanged** — import and reuse, never edit.
- `pnpm test` stays **hermetic**: no network/Docker/real-GitHub/model in unit tests. Real model/Docker/GitHub run ONLY in the smoke (`pnpm sentry-repair-eval`).
- Every outside-world seam (git, the model, the Sentry feed) is an **injected interface** with a mock in tests; real impls live only in the entrypoint.
- New code under `src/lib/agents/remediation/sentry/`. Tests sit beside source as `*.test.ts`. Path alias `@/*` → `./src/*`.
- Local test Postgres only; DB-touching entrypoints refuse a non-local DB (reuse the `assertLocalDb` pattern).
- **Terminal mapping is the kernel's, unchanged:** control-failed / not-reproduced / unstable → `NOT_REPRODUCIBLE`; signature-mismatch → `NEEDS_HUMAN`. This design relies on it; it does not change it.
- **Synthesized test is a BARE call** (never `expect(...).not.toThrow()`), so the defect throws its original error type and the signature (`errorName = error.type`) matches.
- **Call-expression acceptance (host-enforced, static):** exactly one `CallExpression`, callee identifier === `fnName`, arguments each a literal / array-literal / object-literal (recursive); else `synthesis-failed`.
- v1 scope: exactly one changed non-test source file under `src/`; one synthesizable error class; inputs expressible as literals; never auto-merge (draft PR).

---

## File Structure

- `src/lib/agents/remediation/sentry/sentryIssue.ts` — `SentryIssue`/`SentryFrame` types, `SentrySource` interface, `FixtureSentrySource`, `SentryApiSource` stub.
- `src/lib/agents/remediation/sentry/sentryRepo.ts` — the `SentryRepo` git seam (commit existence/ancestry, changed source files, file existence, file read, named-export check) + a `GitSentryRepo` real impl.
- `src/lib/agents/remediation/sentry/triage.ts` — `classifySentryIssue` → reproducible | escalate.
- `src/lib/agents/remediation/sentry/callExpr.ts` — `validateCallExpression(text, fnName)` (TS AST).
- `src/lib/agents/remediation/sentry/synthesizer.ts` — `synthesize` (LLM call expr → host-assembled `SynthesizedTest`).
- `src/lib/agents/remediation/sentry/sentryFixture.ts` — `buildSentryFixture` → `RegressionFixture`.
- `src/lib/agents/remediation/sentry/sentryDefectSource.ts` — single-issue `DefectSource`.
- `src/lib/agents/remediation/sentry/runSentryRemediation.ts` — orchestration loop + records.
- `scripts/agents/fixtures/sentry-issues.json` — fixture payloads.
- `scripts/agents/sentry-repair-eval.ts` — the smoke entrypoint.

---

## Task 1: SentryIssue types + FixtureSentrySource

**Files:**
- Create: `src/lib/agents/remediation/sentry/sentryIssue.ts`
- Test: `src/lib/agents/remediation/sentry/sentryIssue.test.ts`

**Interfaces:**
- Produces:
  - `type SentryFrame = { function: string; filename: string; lineno: number; inApp: boolean }`
  - `type SentryIssue = { id: string; title: string; culprit: string; count: number; firstSeen: string; lastSeen: string; error: { type: string; value: string }; frames: SentryFrame[]; release: { current: string; previous: string | null } }`
  - `interface SentrySource { unresolvedIssues(): Promise<SentryIssue[]> }`
  - `class FixtureSentrySource implements SentrySource` (constructed with `(path: string)`)
  - `class SentryApiSource implements SentrySource` (throws)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/remediation/sentry/sentryIssue.test.ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FixtureSentrySource, SentryApiSource, type SentryIssue } from "./sentryIssue";

const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

const issue: SentryIssue = {
  id: "1", title: "TypeError", culprit: "grade.ts", count: 3, firstSeen: "", lastSeen: "",
  error: { type: "TypeError", value: "Cannot read properties of undefined (reading 'length')" },
  frames: [{ function: "isAnswerCorrect", filename: "src/lib/exam/grade.ts", lineno: 17, inApp: true }],
  release: { current: "cur", previous: "prev" },
};

describe("FixtureSentrySource", () => {
  it("reads issues from a fixture JSON file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sentry-")); created.push(dir);
    const p = join(dir, "issues.json");
    await writeFile(p, JSON.stringify([issue]));
    expect(await new FixtureSentrySource(p).unresolvedIssues()).toEqual([issue]);
  });

  it("SentryApiSource is a stub that refuses (deferred to a later slice)", async () => {
    await expect(new SentryApiSource().unresolvedIssues()).rejects.toThrow(/event:read/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/sentryIssue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the types + sources**

```ts
// src/lib/agents/remediation/sentry/sentryIssue.ts
import { readFile } from "node:fs/promises";

export type SentryFrame = { function: string; filename: string; lineno: number; inApp: boolean };

export type SentryIssue = {
  id: string;
  title: string;
  culprit: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  error: { type: string; value: string };
  frames: SentryFrame[];
  /** Commit SHAs (slice 1): current = defective, previous = known-good candidate. */
  release: { current: string; previous: string | null };
};

/** A pluggable feed of unresolved Sentry issues. */
export interface SentrySource {
  unresolvedIssues(): Promise<SentryIssue[]>;
}

/** Slice-1 default: read synthesized issues from a JSON fixture file. */
export class FixtureSentrySource implements SentrySource {
  constructor(private readonly path: string) {}
  async unresolvedIssues(): Promise<SentryIssue[]> {
    return JSON.parse(await readFile(this.path, "utf8")) as SentryIssue[];
  }
}

/** Same-interface stub for the real API — deferred until an event:read-scoped token exists. */
export class SentryApiSource implements SentrySource {
  unresolvedIssues(): Promise<SentryIssue[]> {
    throw new Error("SentryApiSource not implemented — needs a Sentry token with event:read scope. Use FixtureSentrySource in the sandbox.");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/sentryIssue.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/remediation/sentry/sentryIssue.ts src/lib/agents/remediation/sentry/sentryIssue.test.ts
git commit -m "feat(remediation): SentryIssue types + FixtureSentrySource + SentryApiSource stub"
```

---

## Task 2: SentryRepo git seam

**Files:**
- Create: `src/lib/agents/remediation/sentry/sentryRepo.ts`
- Test: `src/lib/agents/remediation/sentry/sentryRepo.test.ts`

**Interfaces:**
- Produces:
  - `interface SentryRepo { commitExists(sha: string): Promise<boolean>; isAncestor(a: string, b: string): Promise<boolean>; changedSourceFiles(a: string, b: string): Promise<string[]>; fileExistsAt(commit: string, relPath: string): Promise<boolean>; readFileAt(commit: string, relPath: string): Promise<string | null>; hasNamedExport(commit: string, relPath: string, fnName: string): Promise<boolean> }`
  - `class GitSentryRepo implements SentryRepo` (constructed with `(repoRoot: string)`)

- [ ] **Step 1: Write the failing test**

Uses a real temp git repo (git is local, no network — allowed in unit tests).

```ts
// src/lib/agents/remediation/sentry/sentryRepo.test.ts
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { GitSentryRepo } from "./sentryRepo";

const run = promisify(execFile);
const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), "srepo-")); created.push(dir);
  const git = (a: string[]) => run("git", a, { cwd: dir });
  await git(["init", "-q"]); await git(["config", "user.email", "t@t.i"]); await git(["config", "user.name", "t"]);
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src/f.ts"), "export function g(x) { return x; }\n");
  await git(["add", "."]); await git(["commit", "-qm", "good"]);
  const prev = (await git(["rev-parse", "HEAD"])).stdout.trim();
  await writeFile(join(dir, "src/f.ts"), "export function g(x) { return x.y; }\n");
  await git(["add", "."]); await git(["commit", "-qm", "bad"]);
  const cur = (await git(["rev-parse", "HEAD"])).stdout.trim();
  return { dir, prev, cur };
}

describe("GitSentryRepo", () => {
  it("answers existence, ancestry, changed source files, file read, and named-export", async () => {
    const { dir, prev, cur } = await repo();
    const r = new GitSentryRepo(dir);
    expect(await r.commitExists(cur)).toBe(true);
    expect(await r.commitExists("deadbeef")).toBe(false);
    expect(await r.isAncestor(prev, cur)).toBe(true);
    expect(await r.isAncestor(cur, prev)).toBe(false);
    expect(await r.changedSourceFiles(prev, cur)).toEqual(["src/f.ts"]);
    expect(await r.fileExistsAt(cur, "src/f.ts")).toBe(true);
    expect(await r.fileExistsAt(cur, "src/none.ts")).toBe(false);
    expect(await r.readFileAt(cur, "src/f.ts")).toContain("x.y");
    expect(await r.hasNamedExport(cur, "src/f.ts", "g")).toBe(true);
    expect(await r.hasNamedExport(cur, "src/f.ts", "nope")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/sentryRepo.test.ts`
Expected: FAIL — `GitSentryRepo` not defined.

- [ ] **Step 3: Write the seam**

```ts
// src/lib/agents/remediation/sentry/sentryRepo.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Read-only git queries the Sentry triage/synthesis needs, injectable for hermetic tests. */
export interface SentryRepo {
  commitExists(sha: string): Promise<boolean>;
  isAncestor(a: string, b: string): Promise<boolean>;
  /** Non-test source files under src/ changed in a..b. */
  changedSourceFiles(a: string, b: string): Promise<string[]>;
  fileExistsAt(commit: string, relPath: string): Promise<boolean>;
  readFileAt(commit: string, relPath: string): Promise<string | null>;
  hasNamedExport(commit: string, relPath: string, fnName: string): Promise<boolean>;
}

const isTest = (f: string) => /\.test\.[cm]?[jt]sx?$/.test(f);

export class GitSentryRepo implements SentryRepo {
  constructor(private readonly repoRoot: string) {}
  private git(args: string[]) {
    return run("git", args, { cwd: this.repoRoot, maxBuffer: 16 * 1024 * 1024 });
  }
  async commitExists(sha: string): Promise<boolean> {
    return this.git(["cat-file", "-e", `${sha}^{commit}`]).then(() => true).catch(() => false);
  }
  async isAncestor(a: string, b: string): Promise<boolean> {
    return this.git(["merge-base", "--is-ancestor", a, b]).then(() => true).catch(() => false);
  }
  async changedSourceFiles(a: string, b: string): Promise<string[]> {
    const out = (await this.git(["diff", "--name-only", a, b])).stdout.trim();
    return (out ? out.split("\n") : []).filter((f) => f.startsWith("src/") && !isTest(f));
  }
  async fileExistsAt(commit: string, relPath: string): Promise<boolean> {
    return this.git(["cat-file", "-e", `${commit}:${relPath}`]).then(() => true).catch(() => false);
  }
  async readFileAt(commit: string, relPath: string): Promise<string | null> {
    return this.git(["show", `${commit}:${relPath}`]).then((r) => r.stdout).catch(() => null);
  }
  async hasNamedExport(commit: string, relPath: string, fnName: string): Promise<boolean> {
    const src = await this.readFileAt(commit, relPath);
    if (!src) return false;
    // Best-effort: `export function fn`, `export const fn`, `export … class fn`, or `export { fn }`.
    const decl = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${fnName}\\b`);
    const named = new RegExp(`export\\s*\\{[^}]*\\b${fnName}\\b[^}]*\\}`);
    return decl.test(src) || named.test(src);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/sentryRepo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/remediation/sentry/sentryRepo.ts src/lib/agents/remediation/sentry/sentryRepo.test.ts
git commit -m "feat(remediation): SentryRepo git seam (existence/ancestry/changed-source/read/named-export)"
```

---

## Task 3: Triage classifier

**Files:**
- Create: `src/lib/agents/remediation/sentry/triage.ts`
- Test: `src/lib/agents/remediation/sentry/triage.test.ts`

**Interfaces:**
- Consumes: `SentryIssue` (Task 1), `SentryRepo` (Task 2).
- Produces:
  - `type TriageResult = { kind: "reproducible"; sourceRelPath: string; fnName: string; knownGoodCommit: string; defectiveCommit: string } | { kind: "escalate"; reason: string }`
  - `const SYNTHESIZABLE_ERRORS: string[]`
  - `async function classifySentryIssue(issue: SentryIssue, repo: SentryRepo): Promise<TriageResult>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/remediation/sentry/triage.test.ts
import { describe, expect, it } from "vitest";
import { classifySentryIssue } from "./triage";
import type { SentryRepo } from "./sentryRepo";
import type { SentryIssue } from "./sentryIssue";

function repo(over: Partial<SentryRepo> = {}): SentryRepo {
  return {
    commitExists: async () => true,
    isAncestor: async () => true,
    changedSourceFiles: async () => ["src/lib/exam/grade.ts"],
    fileExistsAt: async () => true,
    readFileAt: async () => "export function isAnswerCorrect() {}",
    hasNamedExport: async () => true,
    ...over,
  };
}
function issue(over: Partial<SentryIssue> = {}): SentryIssue {
  return {
    id: "1", title: "t", culprit: "", count: 1, firstSeen: "", lastSeen: "",
    error: { type: "TypeError", value: "x" },
    frames: [{ function: "isAnswerCorrect", filename: "src/lib/exam/grade.ts", lineno: 1, inApp: true }],
    release: { current: "cur", previous: "prev" },
    ...over,
  };
}

describe("classifySentryIssue", () => {
  it("accepts a regression-shaped, single-file, in-app, named-export TypeError", async () => {
    expect(await classifySentryIssue(issue(), repo())).toEqual({
      kind: "reproducible", sourceRelPath: "src/lib/exam/grade.ts", fnName: "isAnswerCorrect", knownGoodCommit: "prev", defectiveCommit: "cur",
    });
  });
  it("escalates no-previous-release", async () => {
    expect(await classifySentryIssue(issue({ release: { current: "cur", previous: null } }), repo())).toEqual({ kind: "escalate", reason: "no-previous-release" });
  });
  it("escalates unresolvable-or-nonlinear-release when previous is not an ancestor", async () => {
    expect(await classifySentryIssue(issue(), repo({ isAncestor: async () => false }))).toEqual({ kind: "escalate", reason: "unresolvable-or-nonlinear-release" });
  });
  it("escalates not-in-app when no in-app frame", async () => {
    expect(await classifySentryIssue(issue({ frames: [{ function: "f", filename: "node_modules/x.js", lineno: 1, inApp: false }] }), repo())).toEqual({ kind: "escalate", reason: "not-in-app" });
  });
  it("escalates unsynthesizable-error-class", async () => {
    expect(await classifySentryIssue(issue({ error: { type: "NetworkError", value: "x" } }), repo())).toEqual({ kind: "escalate", reason: "unsynthesizable-error-class" });
  });
  it("escalates source-not-in-repo when the frame file is absent / out of src", async () => {
    expect(await classifySentryIssue(issue(), repo({ fileExistsAt: async () => false }))).toEqual({ kind: "escalate", reason: "source-not-in-repo" });
  });
  it("escalates unsupported-multi-file-regression", async () => {
    expect(await classifySentryIssue(issue(), repo({ changedSourceFiles: async () => ["src/lib/exam/grade.ts", "src/other.ts"] }))).toEqual({ kind: "escalate", reason: "unsupported-multi-file-regression" });
  });
  it("escalates frame-not-named-export", async () => {
    expect(await classifySentryIssue(issue(), repo({ hasNamedExport: async () => false }))).toEqual({ kind: "escalate", reason: "frame-not-named-export" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/triage.test.ts`
Expected: FAIL — `classifySentryIssue` not defined.

- [ ] **Step 3: Write the classifier**

```ts
// src/lib/agents/remediation/sentry/triage.ts
import { normalize } from "node:path";
import type { SentryIssue } from "./sentryIssue";
import type { SentryRepo } from "./sentryRepo";

export type TriageResult =
  | { kind: "reproducible"; sourceRelPath: string; fnName: string; knownGoodCommit: string; defectiveCommit: string }
  | { kind: "escalate"; reason: string };

/** Thrown-exception classes we can reproduce as a bare call. NOT network/timeout/DB. */
export const SYNTHESIZABLE_ERRORS = ["TypeError", "RangeError", "ReferenceError", "Error"];

/** Normalize a frame filename to a repo-relative path inside src/ with no traversal/escape,
 *  or null if it is not a safe in-src path. */
function safeSourceRelPath(filename: string): string | null {
  const rel = normalize(filename).replace(/^\.\//, "");
  if (rel.startsWith("..") || rel.includes("/../") || rel.startsWith("/")) return null;
  if (!rel.startsWith("src/")) return null;
  return rel;
}

/**
 * Decide whether a Sentry issue is auto-fixable (regression-shaped + reproducible as a
 * bare call), or escalate with a reason. Every gate is fail-closed; see spec §3.3.
 */
export async function classifySentryIssue(issue: SentryIssue, repo: SentryRepo): Promise<TriageResult> {
  const { current, previous } = issue.release;
  if (!previous) return { kind: "escalate", reason: "no-previous-release" };
  if (!(await repo.commitExists(current)) || !(await repo.commitExists(previous)) || !(await repo.isAncestor(previous, current))) {
    return { kind: "escalate", reason: "unresolvable-or-nonlinear-release" };
  }
  const frame = issue.frames.find((f) => f.inApp);
  if (!frame) return { kind: "escalate", reason: "not-in-app" };
  if (!SYNTHESIZABLE_ERRORS.includes(issue.error.type)) return { kind: "escalate", reason: "unsynthesizable-error-class" };

  const sourceRelPath = safeSourceRelPath(frame.filename);
  if (!sourceRelPath || !(await repo.fileExistsAt(current, sourceRelPath))) {
    return { kind: "escalate", reason: "source-not-in-repo" };
  }
  const changed = await repo.changedSourceFiles(previous, current);
  if (changed.length !== 1 || changed[0] !== sourceRelPath) {
    return { kind: "escalate", reason: "unsupported-multi-file-regression" };
  }
  if (!(await repo.hasNamedExport(current, sourceRelPath, frame.function))) {
    return { kind: "escalate", reason: "frame-not-named-export" };
  }
  return { kind: "reproducible", sourceRelPath, fnName: frame.function, knownGoodCommit: previous, defectiveCommit: current };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/triage.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/remediation/sentry/triage.ts src/lib/agents/remediation/sentry/triage.test.ts
git commit -m "feat(remediation): Sentry triage classifier (reproducible | escalate with reason)"
```

---

## Task 4: Call-expression validator

**Files:**
- Create: `src/lib/agents/remediation/sentry/callExpr.ts`
- Test: `src/lib/agents/remediation/sentry/callExpr.test.ts`

**Interfaces:**
- Produces: `function validateCallExpression(text: string, fnName: string): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/remediation/sentry/callExpr.test.ts
import { describe, expect, it } from "vitest";
import { validateCallExpression } from "./callExpr";

describe("validateCallExpression", () => {
  it("accepts a single call of fnName with literal / array / object args", () => {
    expect(validateCallExpression(`isAnswerCorrect({ id: "a", n: -1, ok: true }, ["a", "a"]);`, "isAnswerCorrect"))
      .toBe(`isAnswerCorrect({ id: "a", n: -1, ok: true }, ["a", "a"])`);
  });
  it("strips a trailing semicolon and surrounding markdown fence", () => {
    expect(validateCallExpression("```ts\nf(1)\n```", "f")).toBe("f(1)");
  });
  it("rejects a wrong callee", () => {
    expect(validateCallExpression("other(1)", "f")).toBeNull();
  });
  it("rejects a non-literal argument (identifier / nested call / member access)", () => {
    expect(validateCallExpression("f(x)", "f")).toBeNull();
    expect(validateCallExpression("f(g(1))", "f")).toBeNull();
    expect(validateCallExpression("f(a.b)", "f")).toBeNull();
  });
  it("rejects anything that is not a single call expression", () => {
    expect(validateCallExpression("f(1); f(2)", "f")).toBeNull();
    expect(validateCallExpression("const x = f(1)", "f")).toBeNull();
    expect(validateCallExpression("not code {{", "f")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/callExpr.test.ts`
Expected: FAIL — `validateCallExpression` not defined.

- [ ] **Step 3: Write the validator**

```ts
// src/lib/agents/remediation/sentry/callExpr.ts
import ts from "typescript";

/** Strip a single ```lang … ``` markdown fence if the model wrapped its output in one. */
function stripFence(text: string): string {
  const m = text.trim().match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : text).trim();
}

function isLiteralArg(n: ts.Node): boolean {
  if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return true;
  if (n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword || n.kind === ts.SyntaxKind.NullKeyword) return true;
  // Allow a negative numeric literal (e.g. -1).
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand)) return true;
  if (ts.isArrayLiteralExpression(n)) return n.elements.every(isLiteralArg);
  if (ts.isObjectLiteralExpression(n)) {
    return n.properties.every((p) => ts.isPropertyAssignment(p) && isLiteralArg(p.initializer));
  }
  return false;
}

/**
 * Accept the LLM's output ONLY if it is exactly one CallExpression whose callee is the
 * identifier `fnName` and whose arguments are literals / array-literals / object-literals
 * (recursive). Returns the normalized call text, or null. Bounds the synthesized body to a
 * pure, side-effect-free literal call — no identifiers, member access, nested calls, imports.
 */
export function validateCallExpression(text: string, fnName: string): string | null {
  const code = stripFence(text).replace(/;\s*$/, "");
  const sf = ts.createSourceFile("call.ts", code, ts.ScriptTarget.Latest, false);
  if (sf.statements.length !== 1) return null;
  const stmt = sf.statements[0]!;
  if (!ts.isExpressionStatement(stmt) || !ts.isCallExpression(stmt.expression)) return null;
  const call = stmt.expression;
  if (!ts.isIdentifier(call.expression) || call.expression.text !== fnName) return null;
  if (!call.arguments.every(isLiteralArg)) return null;
  return code;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/callExpr.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/remediation/sentry/callExpr.ts src/lib/agents/remediation/sentry/callExpr.test.ts
git commit -m "feat(remediation): static call-expression acceptance rule (TS AST) for synthesized tests"
```

---

## Task 5: Repro-synthesizer

**Files:**
- Create: `src/lib/agents/remediation/sentry/synthesizer.ts`
- Test: `src/lib/agents/remediation/sentry/synthesizer.test.ts`

**Interfaces:**
- Consumes: `validateCallExpression` (Task 4), `MessageCreator` from `../../runtime`, `SentryIssue` (Task 1).
- Produces:
  - `type SynthTarget = { sourceRelPath: string; fnName: string; fileSource: string }`
  - `type SynthesizedTest = { relPath: string; source: string; testName: string }`
  - `async function synthesize(target: SynthTarget, issue: SentryIssue, createMessage: MessageCreator): Promise<SynthesizedTest | null>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/remediation/sentry/synthesizer.test.ts
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { synthesize, type SynthTarget } from "./synthesizer";
import type { MessageCreator } from "../../runtime";
import type { SentryIssue } from "./sentryIssue";

const target: SynthTarget = { sourceRelPath: "src/lib/exam/grade.ts", fnName: "isAnswerCorrect", fileSource: "export function isAnswerCorrect(q, s) { return q.options.length === s.length; }" };
const issue = { error: { type: "TypeError", value: "Cannot read properties of undefined (reading 'length')" } } as SentryIssue;

const reply = (text: string): MessageCreator => async () => ({ content: [{ type: "text", text }] } as unknown as Anthropic.Message);

describe("synthesize", () => {
  it("host-assembles a bare-call test from a valid model call expression", async () => {
    const out = await synthesize(target, issue, reply(`isAnswerCorrect({ options: [] }, ["a"])`));
    expect(out).not.toBeNull();
    expect(out!.relPath).toBe("src/lib/exam/__sentry_repro__.test.ts");
    expect(out!.source).toContain(`import { isAnswerCorrect } from "./grade"`);
    expect(out!.source).toContain(`isAnswerCorrect({ options: [] }, ["a"]);`);
    expect(out!.source).not.toContain("toThrow"); // bare call, no assertion
  });

  it("returns null when the model output fails the call-expression rule", async () => {
    expect(await synthesize(target, issue, reply("isAnswerCorrect(someVar)"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/synthesizer.test.ts`
Expected: FAIL — `synthesize` not defined.

- [ ] **Step 3: Write the synthesizer**

```ts
// src/lib/agents/remediation/sentry/synthesizer.ts
import { basename, dirname, join } from "node:path";
import type { MessageCreator } from "../../runtime";
import { validateCallExpression } from "./callExpr";
import type { SentryIssue } from "./sentryIssue";

export type SynthTarget = { sourceRelPath: string; fnName: string; fileSource: string };
export type SynthesizedTest = { relPath: string; source: string; testName: string };

const MODEL = "claude-sonnet-4-6";

function prompt(target: SynthTarget, issue: SentryIssue): string {
  return [
    `A production error was reported by Sentry:`,
    `  error type:  ${issue.error.type}`,
    `  error value: ${issue.error.value}`,
    `  function:    ${target.fnName}  (in ${target.sourceRelPath})`,
    ``,
    `Source of the file:`,
    "```ts",
    target.fileSource,
    "```",
    ``,
    `Output EXACTLY ONE JavaScript call expression that invokes ${target.fnName} with literal`,
    `arguments (string/number/boolean/null literals, arrays, and object literals ONLY) chosen`,
    `so the call reproduces the ${issue.error.type}. No imports, no variables, no other code,`,
    `no explanation — just the single call, e.g.  ${target.fnName}({ ... }, [ ... ])`,
  ].join("\n");
}

/**
 * Synthesize a reproducing test. The LLM produces ONLY the call expression; the host validates
 * it (single literal call of fnName) and assembles the file — import, test name, and a BARE
 * call (no assertion) so the defect throws its original error type. Returns null when the
 * model output is unusable (→ synthesis-failed).
 */
export async function synthesize(target: SynthTarget, issue: SentryIssue, createMessage: MessageCreator): Promise<SynthesizedTest | null> {
  let text: string;
  try {
    const msg = await createMessage({ model: MODEL, max_tokens: 512, messages: [{ role: "user", content: prompt(target, issue) }] });
    const block = msg.content.find((b) => b.type === "text");
    text = block && block.type === "text" ? block.text : "";
  } catch {
    return null;
  }
  const call = validateCallExpression(text, target.fnName);
  if (!call) return null;

  const dir = dirname(target.sourceRelPath);
  const importName = basename(target.sourceRelPath).replace(/\.[cm]?[jt]sx?$/, "");
  const relPath = join(dir, "__sentry_repro__.test.ts");
  const testName = `sentry repro: ${issue.error.type} in ${target.fnName}`;
  const source =
    `import { it } from "vitest";\n` +
    `import { ${target.fnName} } from "./${importName}";\n\n` +
    `it(${JSON.stringify(testName)}, () => {\n  ${call};\n});\n`;
  return { relPath, source, testName };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/synthesizer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/remediation/sentry/synthesizer.ts src/lib/agents/remediation/sentry/synthesizer.test.ts
git commit -m "feat(remediation): LLM repro-synthesizer (host-assembled bare-call test)"
```

---

## Task 6: Sentry fixture assembly

**Files:**
- Create: `src/lib/agents/remediation/sentry/sentryFixture.ts`
- Test: `src/lib/agents/remediation/sentry/sentryFixture.test.ts`

**Interfaces:**
- Consumes: `TriageResult` reproducible shape (Task 3), `SynthesizedTest` (Task 5), `SentryRepo` (Task 2), `RegressionFixture` from `../fixtures`, `createSubstrateIdentity`/`Substrate` from `../substrate`, `dockerVitestCheckRunner`/`dockerVitestHoldoutRunner` from `../isolated/dockerCheckRunner`, `vitestJsonStrategy` from `../real/vitestSubstrate`.
- Produces:
  - `type SentryFixtureSpec = { repoRoot: string; sourceRelPath: string; fnName: string; knownGoodCommit: string; defectiveCommit: string; errorType: string; fingerprint: string; synthesized: SynthesizedTest; image: string }`
  - `async function buildSentryFixture(spec: SentryFixtureSpec, repo: SentryRepo): Promise<RegressionFixture>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/remediation/sentry/sentryFixture.test.ts
import { describe, expect, it } from "vitest";
import { buildSentryFixture, type SentryFixtureSpec } from "./sentryFixture";
import type { SentryRepo } from "./sentryRepo";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/sentryFixture.test.ts`
Expected: FAIL — `buildSentryFixture` not defined.

- [ ] **Step 3: Write the assembly**

```ts
// src/lib/agents/remediation/sentry/sentryFixture.ts
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import type { RegressionFixture } from "../fixtures";
import { createSubstrateIdentity, type Substrate } from "../substrate";
import { dockerVitestCheckRunner, dockerVitestHoldoutRunner } from "../isolated/dockerCheckRunner";
import { vitestJsonStrategy } from "../real/vitestSubstrate";
import type { SentryRepo } from "./sentryRepo";
import type { SynthesizedTest } from "./synthesizer";

export type SentryFixtureSpec = {
  repoRoot: string;
  sourceRelPath: string;
  fnName: string;
  knownGoodCommit: string;
  defectiveCommit: string;
  errorType: string;
  fingerprint: string;
  synthesized: SynthesizedTest;
  image: string;
};

const PLACEHOLDER_HOLDOUT = `import { it, expect } from "vitest";\nit("sentry holdout placeholder — no sibling test (v1)", () => { expect(true).toBe(true); });\n`;

/**
 * Assemble a RegressionFixture whose reproduction is the SYNTHESIZED test, injected into the
 * worktree at each check (holdout-runner mechanism). Re-injection is the tamper guard, so
 * pinnedPaths = []. The holdout is the deterministic sibling `<basename>.test.ts` at the
 * defective commit if it exists (run in-repo), else a passing placeholder. cleanup is a no-op
 * (this operates on the real checkout, not a temp clone).
 */
export async function buildSentryFixture(spec: SentryFixtureSpec, repo: SentryRepo): Promise<RegressionFixture> {
  const { synthesized } = spec;
  const signature = vitestJsonStrategy({ testFile: synthesized.relPath, testName: synthesized.testName, errorName: spec.errorType });

  const siblingRel = join(dirname(spec.sourceRelPath), basename(spec.sourceRelPath).replace(/\.[cm]?[jt]sx?$/, "") + ".test.ts");
  const hasSibling = await repo.fileExistsAt(spec.defectiveCommit, siblingRel);
  const runHoldout = hasSibling
    ? dockerVitestCheckRunner({ image: spec.image, tests: [siblingRel] })
    : dockerVitestHoldoutRunner(spec.image, "src/__sentry_holdout__.test.ts", PLACEHOLDER_HOLDOUT);

  const identity = createSubstrateIdentity({
    kind: "sentry-vitest-v1",
    image: spec.image,
    synthPath: synthesized.relPath,
    synthSource: synthesized.source,
    holdout: hasSibling ? { kind: "sibling", path: siblingRel } : { kind: "placeholder" },
    signature: { testFile: synthesized.relPath, testName: synthesized.testName, errorName: spec.errorType },
    sourceRelPath: spec.sourceRelPath,
  });

  const substrate: Substrate = {
    identity,
    // The synthesized test is not in any commit → inject it before each run.
    runCheck: dockerVitestHoldoutRunner(spec.image, synthesized.relPath, synthesized.source),
    runHoldout,
    signature,
    pinnedPaths: [], // re-injection protects the reproduction; nothing persistent to pin
    readAllowlist: ["src/"],
  };

  return {
    repoRoot: spec.repoRoot,
    knownGoodCommit: spec.knownGoodCommit,
    defectiveCommit: spec.defectiveCommit,
    mainCommit: spec.defectiveCommit,
    fixedSource: "", // the known-good source is not needed (LlmRepairer, not the oracle, repairs)
    sourceRelPath: spec.sourceRelPath,
    incident: { fingerprint: spec.fingerprint, errorType: spec.errorType, sourceFile: spec.sourceRelPath, symbol: spec.fnName },
    substrate,
    verificationProfile: "production-black-box",
    cleanup: async () => {}, // no-op: real checkout, not a temp clone
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/sentryFixture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/remediation/sentry/sentryFixture.ts src/lib/agents/remediation/sentry/sentryFixture.test.ts
git commit -m "feat(remediation): assemble a RegressionFixture from a synthesized Sentry-repro test"
```

---

## Task 7: SentryDefectSource + runSentryRemediation orchestration

**Files:**
- Create: `src/lib/agents/remediation/sentry/sentryDefectSource.ts`
- Create: `src/lib/agents/remediation/sentry/runSentryRemediation.ts`
- Test: `src/lib/agents/remediation/sentry/runSentryRemediation.test.ts`

**Interfaces:**
- Consumes: `DefectSource`/`DefectReport` from `../ci/defectSource`, `RegressionFixture` from `../fixtures`, `SentrySource`/`SentryIssue` (Task 1), `TriageResult` (Task 3), `SynthesizedTest` (Task 5), `RunRemediationResult` from `../ci/runRemediation`, `OpenPr` from `../ci/githubClient`.
- Produces:
  - `class SentryDefectSource implements DefectSource` (constructed with `{ repository; defaultBranch; fixture }`)
  - `type SentryRecord = { issueId: string; status: string; reason?: string; pr?: OpenPr | null }`
  - `type SentryRunDeps = { classify: (i: SentryIssue) => Promise<TriageResult>; synthesize: (i: SentryIssue, t: Extract<TriageResult, { kind: "reproducible" }>) => Promise<SynthesizedTest | null>; remediate: (i: SentryIssue, t: Extract<TriageResult, { kind: "reproducible" }>, s: SynthesizedTest) => Promise<RunRemediationResult> }`
  - `async function runSentryRemediation(source: SentrySource, deps: SentryRunDeps): Promise<SentryRecord[]>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/remediation/sentry/runSentryRemediation.test.ts
import { describe, expect, it, vi } from "vitest";
import { runSentryRemediation, SentryDefectSource, type SentryRunDeps } from "./runSentryRemediation";
import type { SentryIssue, SentrySource } from "./sentryIssue";
import type { RegressionFixture } from "../fixtures";

const mk = (id: string): SentryIssue => ({ id, title: "t", culprit: "", count: 1, firstSeen: "", lastSeen: "", error: { type: "TypeError", value: "x" }, frames: [], release: { current: "c", previous: "p" } });
const source = (issues: SentryIssue[]): SentrySource => ({ unresolvedIssues: async () => issues });
const repro = { kind: "reproducible" as const, sourceRelPath: "src/f.ts", fnName: "f", knownGoodCommit: "p", defectiveCommit: "c" };
const synth = { relPath: "src/__sentry_repro__.test.ts", source: "", testName: "n" };

describe("runSentryRemediation", () => {
  it("records an escalation and never synthesizes/remediates", async () => {
    const deps: SentryRunDeps = {
      classify: async () => ({ kind: "escalate", reason: "not-in-app" }),
      synthesize: vi.fn(), remediate: vi.fn(),
    };
    expect(await runSentryRemediation(source([mk("1")]), deps)).toEqual([{ issueId: "1", status: "NEEDS_HUMAN", reason: "not-in-app" }]);
    expect(deps.synthesize).not.toHaveBeenCalled();
    expect(deps.remediate).not.toHaveBeenCalled();
  });

  it("records synthesis-failed when the synthesizer returns null", async () => {
    const deps: SentryRunDeps = { classify: async () => repro, synthesize: async () => null, remediate: vi.fn() };
    expect(await runSentryRemediation(source([mk("2")]), deps)).toEqual([{ issueId: "2", status: "NEEDS_HUMAN", reason: "synthesis-failed" }]);
    expect(deps.remediate).not.toHaveBeenCalled();
  });

  it("remediates a reproducible+synthesized issue and records the run result", async () => {
    const deps: SentryRunDeps = {
      classify: async () => repro, synthesize: async () => synth,
      remediate: async () => ({ status: "NEEDS_HUMAN", pr: { number: 0, url: "(dry-run)" } }),
    };
    expect(await runSentryRemediation(source([mk("3")]), deps)).toEqual([{ issueId: "3", status: "NEEDS_HUMAN", pr: { number: 0, url: "(dry-run)" } }]);
  });
});

describe("SentryDefectSource", () => {
  it("returns exactly the one DefectReport it was built with", async () => {
    const fixture = { sourceRelPath: "src/f.ts" } as unknown as RegressionFixture;
    const r = await new SentryDefectSource({ repository: "o/r", defaultBranch: "main", fixture }).detect();
    expect(r).toEqual({ repository: "o/r", defaultBranch: "main", fixture });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/runSentryRemediation.test.ts`
Expected: FAIL — modules not defined.

- [ ] **Step 3: Write the source + orchestration**

```ts
// src/lib/agents/remediation/sentry/sentryDefectSource.ts
import type { DefectReport, DefectSource } from "../ci/defectSource";
import type { RegressionFixture } from "../fixtures";

/** A single-issue DefectSource: constructed from an already-triaged + already-synthesized
 *  issue, so detect() always returns exactly that ready report (never null-for-escalation). */
export class SentryDefectSource implements DefectSource {
  constructor(private readonly report: { repository: string; defaultBranch: string; fixture: RegressionFixture }) {}
  async detect(): Promise<DefectReport | null> {
    return this.report;
  }
}
```

```ts
// src/lib/agents/remediation/sentry/runSentryRemediation.ts
import type { OpenPr } from "../ci/githubClient";
import type { RunRemediationResult } from "../ci/runRemediation";
import type { SentryIssue, SentrySource } from "./sentryIssue";
import type { SynthesizedTest } from "./synthesizer";
import type { TriageResult } from "./triage";
export { SentryDefectSource } from "./sentryDefectSource";

type Reproducible = Extract<TriageResult, { kind: "reproducible" }>;

export type SentryRecord = { issueId: string; status: string; reason?: string; pr?: OpenPr | null };

export type SentryRunDeps = {
  classify: (issue: SentryIssue) => Promise<TriageResult>;
  synthesize: (issue: SentryIssue, triaged: Reproducible) => Promise<SynthesizedTest | null>;
  remediate: (issue: SentryIssue, triaged: Reproducible, synth: SynthesizedTest) => Promise<RunRemediationResult>;
};

/**
 * Per issue: triage → (escalate: record reason) / (reproducible: synthesize → (fail: record
 * synthesis-failed) / (ok: remediate via the reused kernel+spine, record the run result)).
 * The escalation reason lives HERE, not in DefectSource.detect (which stays DefectReport|null).
 */
export async function runSentryRemediation(source: SentrySource, deps: SentryRunDeps): Promise<SentryRecord[]> {
  const records: SentryRecord[] = [];
  for (const issue of await source.unresolvedIssues()) {
    const triaged = await deps.classify(issue);
    if (triaged.kind === "escalate") {
      records.push({ issueId: issue.id, status: "NEEDS_HUMAN", reason: triaged.reason });
      continue;
    }
    const synth = await deps.synthesize(issue, triaged);
    if (!synth) {
      records.push({ issueId: issue.id, status: "NEEDS_HUMAN", reason: "synthesis-failed" });
      continue;
    }
    const result = await deps.remediate(issue, triaged, synth);
    records.push({ issueId: issue.id, status: result.status, pr: result.pr });
  }
  return records;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/agents/remediation/sentry/runSentryRemediation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full hermetic sweep + typecheck**

Run: `pnpm typecheck && pnpm exec vitest run src/lib/agents/remediation/`
Expected: typecheck clean; all remediation tests green (187 existing + the new sentry tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/remediation/sentry/sentryDefectSource.ts src/lib/agents/remediation/sentry/runSentryRemediation.ts src/lib/agents/remediation/sentry/runSentryRemediation.test.ts
git commit -m "feat(remediation): SentryDefectSource + runSentryRemediation orchestration (structured escalations)"
```

---

## Task 8: Fixture payloads + smoke entrypoint

**Files:**
- Create: `scripts/agents/fixtures/sentry-issues.json`
- Create: `scripts/agents/sentry-repair-eval.ts`
- Modify: `package.json` (add `sentry-repair-eval` script)

**Interfaces:**
- Consumes: everything above; `GitSentryRepo` (Task 2), `classifySentryIssue` (Task 3), `synthesize` (Task 5), `buildSentryFixture` (Task 6), `SentryDefectSource`/`runSentryRemediation` (Task 7); `runRemediation` from `../ci/runRemediation`, `DraftPublisher` from `../ci/githubDraft`, a dry-run `GitHubClient`; `ensureImage` from `../isolated/dockerCheckRunner`; `LlmRepairer` from `../llm/repairer`; `MessageCreator` from `../runtime`.
- Produces: a runnable `pnpm sentry-repair-eval`.

This task is validated by the smoke run (Step 5); it has no unit test (its logic is the injected seams already tested in Tasks 1–7).

- [ ] **Step 1: Write the fixture payload**

Point a planted regression at a real pure function. First plant it on a throwaway branch (Step 5 does this); the fixture references its two commits by SHA at run time via env, so the JSON carries everything else. Create the JSON with a placeholder `RELEASE_CURRENT`/`RELEASE_PREVIOUS` the entrypoint substitutes from env:

```json
[
  {
    "id": "grade-dedup-typeerror",
    "title": "TypeError: Cannot read properties of undefined (reading 'length')",
    "culprit": "isAnswerCorrect(src/lib/exam/grade.ts)",
    "count": 5,
    "firstSeen": "2026-07-06T00:00:00Z",
    "lastSeen": "2026-07-06T00:00:00Z",
    "error": { "type": "TypeError", "value": "Cannot read properties of undefined (reading 'length')" },
    "frames": [
      { "function": "isAnswerCorrect", "filename": "src/lib/exam/grade.ts", "lineno": 17, "inApp": true }
    ],
    "release": { "current": "RELEASE_CURRENT", "previous": "RELEASE_PREVIOUS" }
  }
]
```

- [ ] **Step 2: Write the entrypoint**

```ts
// scripts/agents/sentry-repair-eval.ts
import "../eval/loadEnv";
import { readFileSync } from "node:fs";
import { prisma } from "../../src/lib/db";
import { ensureImage } from "../../src/lib/agents/remediation/isolated/dockerCheckRunner";
import { LlmRepairer } from "../../src/lib/agents/remediation/llm/repairer";
import { GitSentryRepo } from "../../src/lib/agents/remediation/sentry/sentryRepo";
import { classifySentryIssue } from "../../src/lib/agents/remediation/sentry/triage";
import { synthesize } from "../../src/lib/agents/remediation/sentry/synthesizer";
import { buildSentryFixture } from "../../src/lib/agents/remediation/sentry/sentryFixture";
import { runSentryRemediation, SentryDefectSource, type SentryRunDeps } from "../../src/lib/agents/remediation/sentry/runSentryRemediation";
import { runRemediation } from "../../src/lib/agents/remediation/ci/runRemediation";
import { DraftPublisher } from "../../src/lib/agents/remediation/ci/githubDraft";
import type { GitHubClient, OpenPr } from "../../src/lib/agents/remediation/ci/githubClient";
import type { SentryIssue, SentrySource } from "../../src/lib/agents/remediation/sentry/sentryIssue";
import type { MessageCreator } from "../../src/lib/agents/runtime";
import Anthropic from "@anthropic-ai/sdk";

const REPO = process.cwd();

function assertLocalDb(): void {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname.replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`sentry-repair-eval refuses a non-local DB (host: ${host})`);
}

function dryRunGitHub(): GitHubClient {
  return {
    findOpenPr: async () => null,
    pushFixBranch: async (a) => console.log(`[dry-run] would push ${a.headBranch} (patch ${a.patch.length} bytes)`),
    openDraftPr: async (a): Promise<OpenPr> => { console.log(`[dry-run] would open DRAFT PR base ${a.target.baseRef} labels [${a.labels.join(", ")}]`); return { number: 0, url: "(dry-run)" }; },
    commentOnPr: async () => {},
  };
}

async function main(): Promise<void> {
  assertLocalDb();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("sentry-repair-eval needs ANTHROPIC_API_KEY");
  const cur = process.env.RELEASE_CURRENT, prev = process.env.RELEASE_PREVIOUS;
  if (!cur || !prev) throw new Error("set RELEASE_CURRENT + RELEASE_PREVIOUS to the defective/known-good commit SHAs");

  const image = await ensureImage(REPO);
  const repo = new GitSentryRepo(REPO);
  const client = new Anthropic();
  const createMessage: MessageCreator = (p, o) => client.messages.create(p, o);

  const raw = readFileSync("scripts/agents/fixtures/sentry-issues.json", "utf8").replace("RELEASE_CURRENT", cur).replace("RELEASE_PREVIOUS", prev);
  const source: SentrySource = { unresolvedIssues: async () => JSON.parse(raw) as SentryIssue[] };
  const publisher = new DraftPublisher(dryRunGitHub());

  const deps: SentryRunDeps = {
    classify: (issue) => classifySentryIssue(issue, repo),
    synthesize: async (issue, t) => {
      const fileSource = (await repo.readFileAt(t.defectiveCommit, t.sourceRelPath)) ?? "";
      return synthesize({ sourceRelPath: t.sourceRelPath, fnName: t.fnName, fileSource }, issue, createMessage);
    },
    remediate: async (issue, t, synth) => {
      const fixture = await buildSentryFixture(
        { repoRoot: REPO, sourceRelPath: t.sourceRelPath, fnName: t.fnName, knownGoodCommit: t.knownGoodCommit, defectiveCommit: t.defectiveCommit, errorType: issue.error.type, fingerprint: `${issue.error.type}:${t.sourceRelPath}:${t.fnName}`, synthesized: synth, image },
        repo,
      );
      const defectSource = new SentryDefectSource({ repository: process.env.GITHUB_REPOSITORY ?? "local/smoke", defaultBranch: "main", fixture });
      return runRemediation(defectSource, new LlmRepairer(process.env.REAL_REPAIR_MODEL ? { model: process.env.REAL_REPAIR_MODEL } : {}), publisher, { target: { baseRef: prev, headBranch: `remediation/sentry-${t.defectiveCommit.slice(0, 12)}` } });
    },
  };

  const records = await runSentryRemediation(source, deps);
  console.log(JSON.stringify(records, null, 2));
  if (records.some((r) => r.status === "PROPOSED")) process.exitCode = 1; // production must never auto-PROPOSED
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Add the package.json script**

In `package.json` `"scripts"`, after `"remediation:ci"`, add:

```json
"sentry-repair-eval": "tsx scripts/agents/sentry-repair-eval.ts",
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Smoke validation (manual, dry-run GitHub)**

```bash
# Plant a TypeError regression: make isAnswerCorrect throw on a shape the prior version tolerated.
git checkout -b sentry-smoke
# In src/lib/exam/grade.ts, change a safe access into an unguarded one so a missing field throws
# TypeError (e.g. read `.length` off a value that can be undefined). Commit ONLY grade.ts:
git add src/lib/exam/grade.ts && git commit -qm "test: plant grade TypeError regression (smoke)"
CUR=$(git rev-parse HEAD); PREV=$(git rev-parse HEAD~1)
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres REAL_REPAIR_MODEL=claude-sonnet-4-6 \
  RELEASE_CURRENT=$CUR RELEASE_PREVIOUS=$PREV GITHUB_REPOSITORY=local/smoke pnpm sentry-repair-eval
# Expect: a record with status NEEDS_HUMAN and (LLM permitting) a [dry-run] draft PR line.
git checkout - && git branch -D sentry-smoke
```

Expected: the pipeline triages the issue as reproducible, synthesizes a red test, reproduces (known-good green / defective red) in Docker, the LLM repairs, and a needs_review draft is surfaced as a `[dry-run]` PR — `status: "NEEDS_HUMAN"`. A safety breach (`PROPOSED`) exits non-zero.

- [ ] **Step 6: Commit**

```bash
git add scripts/agents/fixtures/sentry-issues.json scripts/agents/sentry-repair-eval.ts package.json
git commit -m "feat(remediation): Sentry fixture payloads + sentry-repair-eval smoke entrypoint"
```

---

## Self-Review

**Spec coverage:**
- §3.1 SentryIssue payload → Task 1. ✓
- §3.2 FixtureSentrySource + stub → Task 1. ✓
- §3.3 triage (all 7 gates + reasons) → Task 3 (+ SentryRepo in Task 2). ✓
- §3.4 synthesizer (bare call, host-generated scaffold, call-expr rule) → Tasks 4 + 5. ✓
- §3.5 release-baseline resolver → folded into triage (`knownGoodCommit`/`defectiveCommit` from `release`, resolved-as-identity in slice 1) + used by the fixture. ✓
- §3.6 orchestration (records, single-issue source) → Task 7. ✓
- §4 injecting runCheck + re-injection + pinnedPaths=[] + deterministic holdout + cleanup no-op → Task 6. ✓
- §5 terminal mapping + false-fix (existing-tests holdout + human backstop) → Task 6 (holdout) + relies on the unchanged kernel (mapping); the smoke asserts NEEDS_HUMAN, PROPOSED = breach. ✓
- §6 testing (hermetic units + smoke) → Tasks 1–7 hermetic, Task 8 smoke. ✓
- §7 new-code inventory → matches File Structure. ✓
- §8 scope (single-file, one error class, literal inputs, no real API, no auto-merge) → triage gates (Task 3) + call-expr rule (Task 4) + FixtureSentrySource (Task 1) + dry-run PR (Task 8). ✓

**Placeholder scan:** no TBD/TODO; every code step is real; the fixture JSON uses explicit `RELEASE_CURRENT`/`RELEASE_PREVIOUS` tokens the entrypoint substitutes (documented), not a vague placeholder.

**Type consistency:** `SentryIssue`/`SentryFrame`/`SentrySource` (T1) → T3/T5/T7/T8; `SentryRepo` (T2) → T3/T6/T8; `TriageResult` reproducible fields (`sourceRelPath`/`fnName`/`knownGoodCommit`/`defectiveCommit`) (T3) → T6/T7/T8; `validateCallExpression` (T4) → T5; `SynthTarget`/`SynthesizedTest` (T5) → T6/T7/T8; `SentryFixtureSpec` (T6) consumed by T8; `DefectReport`/`DefectSource` (ci) reused by T7; `RunRemediationResult`/`runRemediation`/`DraftPublisher`/`GitHubClient` (ci) reused by T7/T8. `dockerVitestHoldoutRunner` used as `runCheck` matches its `(image, relPath, source)` signature.

**Known plan risks to flag at execution:**
1. The smoke's planted regression must throw the **exact** `error.type` in the fixture (`TypeError`) for the signature to match — Step 5's edit must produce a genuine `TypeError`, and the synthesized call must trigger it at defective while NOT throwing at known-good (a real regression, not a latent bug).
2. Sonnet must produce a literal-only call that reproduces; if it cannot (input not literal-expressible), the run records `synthesis-failed` — that is correct behavior, but the smoke may need a function whose triggering input IS literal-expressible (grade's `isAnswerCorrect(question, selected)` qualifies: object + array literals).
