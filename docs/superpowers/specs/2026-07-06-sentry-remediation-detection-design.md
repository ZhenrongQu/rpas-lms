# Sentry-error remediation detection — design

Date: 2026-07-06
Status: approved (brainstorming), pending implementation plan
Sub-project: **2 of 2** (Sentry source). Reuses the spine + DraftPublisher from sub-project 1 (CI). This spec is **slice 1** of the Sentry source: fixture-driven, one synthesizable error class. Real Sentry API ingestion + at-scale triage is a later slice.

## 1. Context and goal

The remediation kernel is proven and the A/B-shared spine is built (sub-project 1): `DefectSource → { incident, RegressionFixture } → kernel (reproduce → LlmRepairer → verify → needs_review draft) → DraftPublisher → real GitHub draft PR`. This sub-project adds the second, hardest detection source: **production Sentry errors**.

The hard truth this design is built around: **the kernel requires a known-good baseline + a failing test, and a Sentry error gives neither.** So only a narrow class is auto-fixable, and the front-end must be honest about it:

- **Universal ingestion + triage:** accept ANY Sentry issue; only the reproducible subset gets an auto-fix draft; the rest fail closed to NEEDS_HUMAN with a recorded reason. (High-precision, low-recall — the kernel's philosophy.)
- **Only regression-shaped errors fit:** an error present in release N but not N−1. known-good = N−1's commit, defective = N's commit. Latent bugs (no known-good) are out of scope → NEEDS_HUMAN.
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
`classifySentryIssue(issue, repoInspector) → { kind: "reproducible"; sourceRelPath; frame } | { kind: "escalate"; reason }`. Reproducible requires ALL of: `release.previous` present (a known-good candidate); an in-app frame whose `filename` maps to a source file that exists in the repo (the target); `error.type` in a synthesizable allowlist (`TypeError`, `RangeError`, `Error`, … thrown exceptions — not network/timeout/DB classes). Otherwise escalate with `reason` ∈ {`no-previous-release`, `not-in-app`, `unsynthesizable-error-class`, `source-not-in-repo`}.

### 3.4 Repro-synthesizer (LLM)
`synthesize(target, issue, model) → { relPath; source; testName } | null`. Reads the target function's source **at the defective commit** + the Sentry error (type/value/frames); infers a triggering input; emits a vitest test that imports the target and calls it with that input, asserting it does not throw. `relPath = <sourceDir>/__sentry_repro__.test.ts` so `import { fn } from "./<sourceBasename>"` resolves. The model is injected via the runtime `createMessage` seam (hermetic tests script it; the smoke uses the real model). Returns null on model failure → NEEDS_HUMAN.

### 3.5 Release-baseline resolver
`ReleaseResolver.commitFor(release) → commit`. Slice 1 fixture: `release.current`/`release.previous` ARE commit SHAs (identity). Real Sentry (deferred): map a release name → commit via the releases API.

**Why this is safe:** the synthesizer need not know whether the error is a regression. The kernel's known-good control decides — if the inferred input also throws at known-good (a latent bug, not a regression), the control is not green and reproduction is rejected → NEEDS_HUMAN.

## 4. Synthesized-test substrate + fixture assembly

**Injecting runCheck.** The synthesized test is not in any commit, so each check writes it into the worktree first — exactly what `dockerVitestHoldoutRunner(image, relPath, source)` already does. The Sentry fixture therefore uses the injecting runner AS its primary check:
```
substrate.runCheck  = dockerVitestHoldoutRunner(image, synthRelPath, synthSource)   // re-injects the synth test each run
substrate.runHoldout = existing-tests holdout (see §5 false-fix), else placeholder
```
**Re-injection IS the tamper protection:** every check rewrites the synthesized test, so any repairer edit to it is overwritten, and the write policy only permits `sourceRelPath`. Hence `pinnedPaths = []` and `reproductionIntact` is trivially true — protection comes from re-injection, not pinning (unlike the CI source, which pins a real in-repo test).

**Assembly** (`SentryDefectSource` → `RegressionFixture`): `repoRoot` = the checkout; `knownGoodCommit` = `release.previous`, `defectiveCommit`/`mainCommit` = `release.current`; `sourceRelPath` = the in-app frame's source file (the repairer's only writable path); `substrate` as above; `signature = vitestJsonStrategy({ testFile: synthRelPath, testName, errorName: error.type })`; `readAllowlist: ["src/"]`; `verificationProfile: "production-black-box"`.

The kernel's gates then hold: at known-good the injected test must be GREEN (the function did not throw for that input pre-regression); at defective RED with the matching signature; else rejected. `LlmRepairer` fixes `sourceRelPath` until the injected test passes.

## 5. Verification weakness (honest) + error handling

**"Does not throw" is a weak oracle.** A fix that swallows the error (try/catch, early return null) passes it while being wrong. Three mitigations:
1. **Write policy:** the repairer may edit only `sourceRelPath`, never the test; and the synth test is re-injected each check.
2. **Existing-tests holdout (stronger than CI's placeholder):** the target source file usually has a real in-repo test (e.g. `grade.ts` → `grade.test.ts`). Run it AT ITS REAL PATH as the holdout (`dockerVitestCheckRunner`, no injection → no import-relocation problem). A fix that breaks existing behavior → `holdoutPassed = false` → NEEDS_HUMAN. Semantics fit: these errors were not caught by existing tests (that is why they reached prod), so they should stay green through the fix. Fall back to a passing placeholder only when no existing test exists.
3. **Human backstop:** output is a draft PR, never auto-merged; a reviewer catches a "does-not-throw" game. A stronger semantic oracle is deferred.

**Error handling (fail-closed, kernel-reused):**
- Triage escalate → NEEDS_HUMAN + reason; no fixture/PR.
- Synthesized test does not reproduce (known-good not green / defective not red / signature mismatch) → reproduction rejected → NEEDS_HUMAN. Catches bad synthesis AND latent-bug-not-regression.
- Synthesizer model failure/timeout → NEEDS_HUMAN; no fixture.
- Repair non-convergence / verify failure → NEEDS_HUMAN; no PR.
- Infra failure (Docker/DB/API) → propagates, retriable, never a false PR.

## 6. Testing strategy

- **Hermetic unit tests** (`pnpm test`; no network/Docker/API): triage classifier (fixture issue → reproducible/escalate); `FixtureSentrySource` (reads fixture JSON); repro-synthesizer with an INJECTED mock model (scripted `createMessage` → canned test) → builds a `SynthesizedTest`; `SentryDefectSource` assembly with injected mock synthesizer + mock source + fixture issue → `DefectReport` / null-with-reason; release-baseline resolver.
- **End-to-end smoke** (`pnpm sentry-repair-eval`, local): a fixture SentryIssue for a planted throw-regression in a pure rpas-lms function → real model synthesizes the test + real model repairs + real Docker + dry-run GitHub → needs_review draft. Mirrors the CI smoke; the real workflow is out of scope for slice 1.
- **Kernel/substrate/LlmRepairer/spine unchanged** — already covered.
- `pnpm test` stays hermetic: real model/Docker/GitHub only in the smoke.

## 7. New code (all under `src/lib/agents/remediation/sentry/`, reusing the spine)

- `sentryIssue.ts` — `SentryIssue`/`SentryFrame` types + `FixtureSentrySource` + `SentryApiSource` stub.
- `triage.ts` — `classifySentryIssue` → reproducible | escalate.
- `synthesizer.ts` — the LLM repro-synthesizer → `SynthesizedTest | null`.
- `sentryFixture.ts` — assemble a `RegressionFixture` (injecting runCheck + existing-tests holdout + baseline).
- `sentryDefectSource.ts` — triage + synthesize + assemble → `DefectReport | null` (escalate → null + logged reason).
- `scripts/agents/fixtures/sentry-issues.json` — synthesized fixture payloads.
- `scripts/agents/sentry-repair-eval.ts` — the smoke entrypoint (iterates unresolved issues; each candidate → `runRemediation`).
- **Reused:** `runRemediation`, `DraftPublisher`, `GitHubClient`, `LlmRepairer`, the kernel. **No kernel changes.**

## 8. Scope boundary (slice 1)

Does NOT include: real Sentry API (`SentryApiSource` stub); error classes beyond a thrown exception in a pure-ish function (others escalate); a stronger oracle than "does not throw" + existing-tests holdout + human backstop; persisted escalation records (logged only); multi-source-file regressions; auto-merge. These are explicit, safe limitations for slice 1.
