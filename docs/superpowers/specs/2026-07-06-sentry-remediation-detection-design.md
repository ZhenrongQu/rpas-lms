# Sentry-error remediation detection — design

Date: 2026-07-06
Status: approved (brainstorming), pending implementation plan
Sub-project: **2 of 2** (Sentry source). Reuses the spine + DraftPublisher from sub-project 1 (CI). This spec is **slice 1** of the Sentry source: fixture-driven, one synthesizable error class. Real Sentry API ingestion + at-scale triage is a later slice.

## 1. Context and goal

The remediation kernel is proven and the A/B-shared spine is built (sub-project 1): `DefectSource → { incident, RegressionFixture } → kernel (reproduce → LlmRepairer → verify → needs_review draft) → DraftPublisher → real GitHub draft PR`. This sub-project adds the second, hardest detection source: **production Sentry errors**.

The hard truth this design is built around: **the kernel requires a known-good baseline + a failing test, and a Sentry error gives neither.** So only a narrow class is auto-fixable, and the front-end must be honest about it:

- **Universal ingestion + triage:** accept ANY Sentry issue; only the reproducible subset gets an auto-fix draft; the rest fail closed to NEEDS_HUMAN with a recorded reason. (High-precision, low-recall — the kernel's philosophy.)
- **Only regression-shaped errors fit:** an error present in release N but not N−1. known-good = N−1's commit, defective = N's commit. Latent bugs are out of scope — either escalated at triage when there is no prior release (`NEEDS_HUMAN`), or rejected by the kernel's control check when the synthesized input also fails at the prior release (`NOT_REPRODUCIBLE`). See §5 for the exact terminals.
- **A reproducing test is SYNTHESIZED by an LLM** from the target function's source + the error, then VALIDATED by the kernel's reproduction gate. A bad synthesis (or a latent bug, not a regression) fails the known-good-green / defective-red control and is rejected.

**Non-goals (slice 1):** real Sentry API (`SentryApiSource` stays a stub — no production error stream exists yet, the app is not deployed); error classes beyond a thrown exception in a pure-ish function; a stronger correctness oracle than "does not throw"; persisted escalation records; multi-source-file regressions; auto-merge.

## 2. Architecture

`SentryDefectSource` is another `DefectSource` implementation; it reuses the entire spine.

```
FixtureSentrySource (any SentryIssue)
      │
      ▼
  triage ──not reproducible──► escalate: NEEDS_HUMAN + reason (no fixture, no PR)
      │ reproducible (regression-shaped + in-app frame in repo + synthesizable error class)
      ▼
  repro-synthesizer (LLM: function source + error → inferred input → a red test file)
      │
      ▼
  assemble RegressionFixture (synthesized test injected; known-good/defective from the release pair)
      │
      ▼
  [ existing kernel ]  ← the reproduction gate VALIDATES the synthesized test
  reproduce → LlmRepairer fix → verify → needs_review draft
      │
      ▼
  DraftPublisher → real GitHub draft PR (reused from sub-project 1)
```

Two properties distinguish this from the CI source:

1. **The test is synthesized and NOT in repo history** — so it is injected into the worktree at check time (reusing the holdout-runner's "write file + run" mechanism).
2. **The synthesizer is itself an LLM** (like the repairer), but its output is judged by the deterministic kernel — it only proposes a candidate red test; whether it counts is the kernel's call.

**Reused unchanged:** `runRemediation`, `DraftPublisher`, `GitHubClient`, `LlmRepairer`, `verify`, lease/CAS, the whole kernel. No kernel changes.

## 3. Components

### 3.1 SentryIssue payload (extends the deleted `triage/sentry.ts` prior art)
```
type SentryFrame = { function: string; filename: string; lineno: number; inApp: boolean };
type SentryIssue = {
  id; title; culprit; count; firstSeen; lastSeen;
  error: { type: string; value: string };          // "TypeError" / "Cannot read properties of undefined (reading 'length')"
  frames: SentryFrame[];                             // innermost in-app frame = target function + source file
  release: { current: string; previous: string | null };  // commit SHAs: current = defective, previous = known-good candidate
};
```

### 3.2 FixtureSentrySource
Reads synthesized issues from `scripts/agents/fixtures/sentry-issues.json` (slice-1 default, echoing prior art). `SentryApiSource` is a same-interface stub that throws "needs an event:read-scoped token" — deferred.

### 3.3 Triage classifier
`classifySentryIssue(issue, repo) → { kind: "reproducible"; sourceRelPath; fnName; knownGoodCommit; defectiveCommit } | { kind: "escalate"; reason }`. Reproducible requires ALL of the following; any failure escalates with the paired `reason`:

- `release.previous` present — `no-previous-release`.
- Both `release.current` and `release.previous` resolve to commits that **exist** in the repo, and `previous` is an **ancestor** of `current` — `unresolvable-or-nonlinear-release`.
- An **in-app** frame (`inApp === true`) — `not-in-app`.
- `error.type` in a synthesizable allowlist (`TypeError`, `RangeError`, `Error`, thrown exceptions — not network/timeout/DB classes) — `unsynthesizable-error-class`.
- The frame's `filename`, normalized to a **repo-relative** path, is inside `src/`, contains no `..` traversal, resolves (no symlink escape) to a file that **exists at `release.current`** — `source-not-in-repo`. This becomes `sourceRelPath`.
- Exactly **one** production source file (a non-test file under `src/`) changed in `previous..current`, and it equals `sourceRelPath` — `unsupported-multi-file-regression`. (Mirrors the CI source's single-source-file scope; the kernel's `sourceRelPath` contract is single-file.)
- The frame's `function` resolves to a **named export** of `sourceRelPath` at `release.current` (best-effort: the name appears as an `export … <fnName>` / `export { … <fnName> … }` binding) — `frame-not-named-export`. This becomes `fnName`, which the synthesizer imports by name.

All repo reads (existence, diff scope, named-export check) are against **`release.current`**, never the working checkout.

### 3.4 Repro-synthesizer (LLM)
`synthesize(target, issue, model) → SynthesizedTest | null` where `SynthesizedTest = { relPath; source; testName }`.

**Path/name are HOST-generated, never the LLM's.** The host fixes `relPath = <sourceDir>/__sentry_repro__.test.ts`, `testName`, the import line `import { <fnName> } from "./<sourceBasename>"`, and the `it(...)` scaffold. The LLM's ONLY job is to infer the triggering **call** — an expression that invokes `<fnName>` with reconstructed arguments (literals / inline object construction, no imports of its own). The host assembles `source` = the import + `it(testName, () => { <llm-call-expression>; })`. This removes path-injection risk and makes synthesis reliable. (Slice-1 limitation: inputs must be expressible from the imported target + literals; anything needing extra imports/types → escalate.)

**A BARE call, no `.not.toThrow()`.** The test body is just the call expression. At the defective commit the function throws its original error, so vitest reports the test failing with `<error.type>: …` — matching the signature (`errorName = error.type`). At known-good the call returns normally → the test passes (green). Wrapping in `expect(...).not.toThrow()` would instead surface an `AssertionError`, which would never match the Sentry error type — so it is forbidden.

The LLM reads the target function's source **at `release.current`** + the Sentry error (type/value/frames) to infer the call. The model is injected via the runtime `createMessage` seam (hermetic tests script it; the smoke uses the real model).

**Call-expression acceptance rule (host-enforced, static — defines "unusable call").** The host parses the LLM's output with a TypeScript/ESTree parser and accepts it ONLY if it is exactly ONE `CallExpression` whose `callee` is an identifier equal to `fnName`, and whose arguments are each a literal, array literal, or object literal — recursively (string/number/boolean/null literals, `[...]`, `{...}` only). No other identifiers, member/property access chains, nested calls, `new`, template expressions with substitutions, spreads, or arrow/function expressions. Anything else → **null → `synthesis-failed`**. This bounds what the synthesized body can do to a pure, side-effect-free call of the target with literal data — no path/import/execution surface for the LLM to widen. (Slice-1 consequence: inputs the target needs that are not expressible as literals — class instances, imported constructors — escalate rather than synthesize.)

On any of {model failure, output not parseable, rejected by the rule} the issue does not become a fixture (recorded as a `synthesis-failed` escalation by the orchestration layer).

### 3.5 Release-baseline resolver
`ReleaseResolver.commitFor(release) → commit`. Slice 1 fixture: `release.current`/`release.previous` ARE commit SHAs (identity). Real Sentry (deferred): map a release name → commit via the releases API.

**Why this is safe:** the synthesizer need not know whether the error is a regression. The kernel's known-good control decides — if the inferred input also throws at known-good (a latent bug, not a regression), the control is not green and reproduction is rejected → `NOT_REPRODUCIBLE` (see §5 for the exact terminal).

### 3.6 Orchestration (keeps `DefectSource` + the spine unchanged)
`DefectSource.detect()` returns `DefectReport | null` and cannot carry an escalation reason — so triage and escalation live in a Sentry **orchestration layer**, NOT inside `detect`. `runSentryRemediation(source, model, publisher, opts)` iterates `source.unresolvedIssues()` and, per issue:
1. `classifySentryIssue` → on `escalate`, emit a structured record `{ issueId, status: "NEEDS_HUMAN", reason }` and continue (no kernel, no PR).
2. On `reproducible`, `synthesize` → on failure, emit `{ issueId, status: "NEEDS_HUMAN", reason: "synthesis-failed" }` and continue.
3. On a synthesized test, build a **single-issue** `SentryDefectSource` (which returns exactly that one `DefectReport`) and call the reused `runRemediation(defectSource, repairer, publisher, …)`; record `{ issueId, status: <run result>, pr }`.

So `SentryDefectSource.detect()` only ever returns a ready `DefectReport` (it is constructed from an already-triaged, already-synthesized issue) — `null` is not used for escalation. The per-issue records are the orchestration's structured output (printed in slice 1; §8 defers persistence).

## 4. Synthesized-test substrate + fixture assembly

**Injecting runCheck.** The synthesized test is not in any commit, so each check writes it into the worktree first — exactly what `dockerVitestHoldoutRunner(image, relPath, source)` already does. The Sentry fixture therefore uses the injecting runner AS its primary check:
```
substrate.runCheck  = dockerVitestHoldoutRunner(image, synthRelPath, synthSource)   // re-injects the synth test each run
substrate.runHoldout = existing-tests holdout (see §5 false-fix), else placeholder
```
**Re-injection IS the tamper protection:** every check rewrites the synthesized test, so any repairer edit to it is overwritten, and the write policy only permits `sourceRelPath`. Hence `pinnedPaths = []` and `reproductionIntact` is trivially true — protection comes from re-injection, not pinning (unlike the CI source, which pins a real in-repo test).

**Assembly** (`SentryDefectSource` → `RegressionFixture`): `repoRoot` = the checkout; `knownGoodCommit` = the resolved `release.previous` commit, `defectiveCommit`/`mainCommit` = the resolved `release.current` commit; `sourceRelPath` = the triaged single source file (the repairer's only writable path, guaranteed under `src/`); `substrate` as above; `signature = vitestJsonStrategy({ testFile: synthRelPath, testName, errorName: error.type })`; `readAllowlist: ["src/"]` (consistent with `sourceRelPath` ∈ `src/`, enforced in triage); `verificationProfile: "production-black-box"`; `cleanup: async () => {}` — a **no-op**: this fixture operates on the real checkout, not a temp clone, so it must not delete anything (unlike the temp-clone fixtures).

The kernel's gates then hold: at known-good the injected test must be GREEN (the function did not throw for that input pre-regression); at defective RED with the matching signature; else rejected. `LlmRepairer` fixes `sourceRelPath` until the injected test passes.

## 5. Verification weakness (honest) + error handling

**"Does not throw" is a weak oracle.** A fix that swallows the error (try/catch, early return null) passes it while being wrong. Three mitigations:
1. **Write policy:** the repairer may edit only `sourceRelPath`, never the test; and the synth test is re-injected each check.
2. **Existing-tests holdout (stronger than CI's placeholder), by a DETERMINISTIC rule:** the holdout is the sibling test `<sourceDir>/<sourceBasename>.test.ts` **iff it exists at `release.current`** — run AT ITS REAL PATH (`dockerVitestCheckRunner`, no injection → no import-relocation problem). A fix that breaks existing behavior → `holdoutPassed = false` → NEEDS_HUMAN. Semantics fit: these errors were not caught by existing tests (that is why they reached prod), so they should stay green through the fix. When that sibling test does not exist, inject an explicit isolated passing placeholder holdout (same as the CI source). No fuzzy "usually has a test" — exactly the sibling path or the placeholder.
3. **Human backstop:** output is a draft PR, never auto-merged; a reviewer catches a "does-not-throw" game. A stronger semantic oracle is deferred.

**Error handling (fail-closed) — using the kernel's ACTUAL terminal mapping (unchanged):**
The kernel's reproduction gate maps outcomes as: `control-failed` (known-good not green) and `not-reproduced` (defective green) → **`NOT_REPRODUCIBLE`**; `signature-mismatch` → **`NEEDS_HUMAN`**; `unstable` → `NOT_REPRODUCIBLE`. Both are safe, no-PR terminals — this design does NOT change that mapping (kernel unchanged), it just relies on it:
- Triage escalate (before the kernel) → the orchestration records `{ issueId, status: "NEEDS_HUMAN", reason }`; no fixture/PR.
- A synthesized input that also throws at known-good (a latent bug, not a regression) → `control-failed` → **`NOT_REPRODUCIBLE`**.
- A synthesized input that does not throw at defective → `not-reproduced` → **`NOT_REPRODUCIBLE`**.
- A throw at defective with a non-matching error type → `signature-mismatch` → **`NEEDS_HUMAN`**.
- Synthesizer model failure / unusable call → the orchestration records a synthesis escalation; no fixture.
- Repair non-convergence / verify failure → `NEEDS_HUMAN`; no PR.
- Infra failure (Docker/DB/API) → propagates, retriable, never a false PR.

## 6. Testing strategy

- **Hermetic unit tests** (`pnpm test`; no network/Docker/API):
  - triage classifier — each escalation reason + the reproducible case (fixture issue → `reproducible`/`escalate`).
  - `FixtureSentrySource` (reads fixture JSON).
  - repro-synthesizer with an INJECTED mock model (scripted `createMessage` → a canned call expression) → builds a `SynthesizedTest`; plus the call-expression validator (see §3.4) — a valid call, and each rejection (wrong callee / non-literal arg / not a single CallExpression) → null.
  - `SentryDefectSource` — constructed from an already-triaged + already-synthesized issue, `detect()` returns a single ready `DefectReport` (NO null-with-reason; escalation is not this unit's concern).
  - `runSentryRemediation` orchestration — with a fake `SentrySource` + injected triage/synthesize seams: an escalated issue emits `{ issueId, NEEDS_HUMAN, reason }` and never touches the kernel; a synthesis failure emits `{ …, reason: "synthesis-failed" }`; a reproducible+synthesized issue calls `runRemediation` (stub) and records its result.
  - release-baseline resolver.
- **End-to-end smoke** (`pnpm sentry-repair-eval`, local): a fixture SentryIssue for a planted throw-regression in a pure rpas-lms function → real model synthesizes the test + real model repairs + real Docker + dry-run GitHub → needs_review draft. Mirrors the CI smoke; the real workflow is out of scope for slice 1.
- **Kernel/substrate/LlmRepairer/spine unchanged** — already covered.
- `pnpm test` stays hermetic: real model/Docker/GitHub only in the smoke.

## 7. New code (all under `src/lib/agents/remediation/sentry/`, reusing the spine)

- `sentryIssue.ts` — `SentryIssue`/`SentryFrame` types + `FixtureSentrySource` + `SentryApiSource` stub.
- `triage.ts` — `classifySentryIssue` → reproducible | escalate.
- `synthesizer.ts` — the LLM repro-synthesizer: infers the call expression; the host assembles the test file/path/name/import → `SynthesizedTest | null`.
- `sentryFixture.ts` — assemble a `RegressionFixture` from a triaged issue + a `SynthesizedTest` (injecting runCheck + deterministic sibling-test-or-placeholder holdout + baseline; `cleanup` no-op).
- `sentryDefectSource.ts` — a single-issue `DefectSource` constructed from an already-triaged + already-synthesized issue; `detect()` returns exactly that `DefectReport`.
- `runSentryRemediation.ts` — the orchestration loop (§3.6): per issue triage → synthesize → single-issue `SentryDefectSource` → reused `runRemediation`; emits `{ issueId, status, reason?, pr? }` records.
- `scripts/agents/fixtures/sentry-issues.json` — synthesized fixture payloads.
- `scripts/agents/sentry-repair-eval.ts` — the smoke entrypoint (wires `FixtureSentrySource` + real model + real Docker + dry-run GitHub into `runSentryRemediation`).
- **Reused:** `runRemediation`, `DraftPublisher`, `GitHubClient`, `LlmRepairer`, the kernel. **No kernel changes.**

## 8. Scope boundary (slice 1)

Does NOT include: real Sentry API (`SentryApiSource` stub); error classes beyond a thrown exception in a pure-ish function (others escalate); a stronger oracle than "does not throw" + existing-tests holdout + human backstop; persisted escalation records (logged only); multi-source-file regressions; auto-merge. These are explicit, safe limitations for slice 1.
