# CI-failure remediation detection — design

Date: 2026-07-05
Status: approved (brainstorming), pending implementation plan
Sub-project: **1 of 2** (spine + CI source). Sub-project 2 (production Sentry source) reuses the same spine and is out of scope here.

## 1. Context and goal

The remediation kernel is proven: given a reproducible regression (a red test + a known-good baseline), it reproduces the defect in a Docker-isolated real-vitest substrate, lets an untrusted `LlmRepairer` attempt a fix through a sandboxed capability, verifies with deterministic gates + a hidden holdout, and files a `needs_review` artifact — fail-closed everywhere (see the 2026-07-05 real vertical: Sonnet fixed the `grade.ts` grade-dedup regression → needs_review draft with the real patch, NEEDS_HUMAN).

What is entirely missing is **detection**: today incidents + reproduction inputs are hand-fed by eval/smoke scripts. The **ultimate goal** is production-side auto-detect + auto-fix. This sub-project builds the first, easiest detection source — **CI test failures** — because a failing CI test hands the kernel exactly what it needs (a red test = the signature; the last-green commit = the known-good baseline) for free.

**Non-goals:** production Sentry ingestion (sub-project 2); non-regression defects (no known-good, no failing test); auto-merge (never — the output is a human-reviewed draft PR).

## 2. Architecture — the shared spine

```
DefectSource ──► { incident, RegressionFixture } ──► [ existing kernel ] ──► DraftPublisher ──► GitHub draft PR
   A: CiDefectSource                                 reproduce→repair→verify   (real GitHub)
   B: SentryDefectSource (later)
```

`DefectSource` and `DraftPublisher` are the A/B-shared spine. A and B differ ONLY in how the `DefectSource` produces reproduction inputs. **The kernel, substrate, `LlmRepairer`, verify, and lease/CAS are reused unchanged.**

Crucial difference from the eval harness: the eval **synthesizes** a defect (hand-written `mutate` + hand-written holdout). The CI source does not — **the defect IS the real diff between the known-good and defective commits**, and there is no hand-written holdout (see §3.3).

## 3. CiDefectSource — a real CI failure → reproduction inputs

Inputs available in the CI environment: the vitest JSON report of the failing run, the triggering event (pull_request vs push:main), and the head SHA. It produces a `RegressionFixture` (same shape `buildRealRepoFixture` already returns).

### 3.1 Signature extraction
The CI test job runs vitest and uploads its JSON report as an artifact. `CiDefectSource` parses it with the existing `vitestJsonStrategy` to derive the incident signature (failing test file + test name + error) and `relatedTests`. No new signature logic.

### 3.2 Baseline resolver (known-good / defective commits)
- **PR trigger:** `defective` = PR head SHA; `known-good` = the base branch (`main`) tip — protected, assumed green.
- **main trigger:** `defective` = current `main` HEAD; `known-good` = the last `main` commit whose CI concluded success (queried from the GitHub Actions API).

The kernel's reproduction gate then enforces correctness: known-good must be GREEN and defective RED with the matching signature. If the baseline is wrong (base is also red / unstable / signature mismatch) → `NOT_REPRODUCIBLE`, no PR — fail-closed by construction.

### 3.3 False-fix guard (holdout for a real regression)
There is no hand-written hidden holdout for a real regression. Decision:

> The holdout becomes **best-effort "related-tests selection"**: test files that import the changed source file but were NOT the one CI flagged, run in the verify phase via the existing "run holdout after patch capture" mechanism (source changes to an existing-tests source, not a synthesized file). When no related test exists, mark the run **"no independent holdout" (lower confidence)** and still file the draft.

Rationale: because the output is a **human-reviewed draft PR that is never auto-merged**, the false-fix guard is defense-in-depth, not the sole gate — the human is the backstop. Test files remain pinned (the repairer cannot edit tests) and no other suite test may newly fail; those already block the common gamed fix. This is consistent with the existing `needs_review`/human-approves posture.

## 4. DraftPublisher — real GitHub draft PR

Replaces the mock `publishReviewDraft` output with a real draft PR (behind a `GitHubClient` seam).

- **Contents:** a new branch `remediation/<fingerprint-short>` = known-good baseline + the LLM patch, opened as a **draft** PR. Body carries the full evidence (reproduction red→green, holdout result/confidence, gates, the failing test, a redacted repair trace). Labels: `automated-remediation`, `needs-human-review`. The diff is clean — only the fix.
- **Targeting:** main trigger → base `main`; same-repo PR trigger → base = the PR's head branch (author can merge the fix into their PR); fork PR (cannot push a branch) → fall back to posting the patch as a PR comment (v1 limitation).
- **Idempotency / no duplicate PRs:** reuse the existing `ExternalAction` model (unique per `incidentId + kind`, which already dedups). First cycle creates the branch + PR and records the PR number on the `ExternalAction`; a same-fingerprint re-run updates the existing PR's branch (force-push the new patch) or no-ops if unchanged. The append-only cycle/version model is unchanged.
- **Auth:** the Actions-provided `GITHUB_TOKEN` with workflow permissions `contents: write` + `pull-requests: write`. No extra hosting/config.
- **Loop prevention:** PRs opened by `GITHUB_TOKEN` do NOT trigger other workflows (GitHub default) — a natural guard against the agent's own PR re-triggering it; plus a `remediation/*` branch-prefix + label skip guard as belt-and-suspenders.

## 5. Self-contained GitHub Actions workflow

Two workflows, separated by responsibility:

- **`test.yml`** (normal CI, which the project currently lacks): `on: pull_request` + `push: branches:[main]`; runs vitest and **uploads the JSON report as an artifact**.
- **`remediation.yml`**: `on: workflow_run` of `test.yml`, `types:[completed]`, guarded by `conclusion == 'failure'`. Downloads the report artifact → runs the agent → opens the draft PR.

Using `workflow_run` (rather than inlining remediation into `test.yml`): runs only on real failure (saves compute), and exposes which tests failed + the triggering context (PR vs push, head SHA).

**remediation job environment (self-contained):**
- `services: postgres: pgvector/pgvector:pg16` (the kernel DB).
- Docker on the runner (the isolated LLM check runner).
- `actions/checkout` with `fetch-depth: 0` (full history for baseline/merge-base resolution).
- Secrets: `ANTHROPIC_API_KEY` (repo secret); `GITHUB_TOKEN` (auto).
- Steps: `pnpm install` → `pnpm db:push` (to the service DB) → **`pnpm remediation:ci`** (new entrypoint: DefectSource → kernel → DraftPublisher, analogous to `real-repair-eval` but with real inputs + real output).

**Guardrails:** `concurrency` grouped by head branch (no duplicate PRs); job-level timeout; skip when the failing commit is on a `remediation/*` branch (loop guard).

## 6. Error handling

All reuse the kernel's fail-closed posture:
- Baseline not reproducible (base red / unstable / signature mismatch) → `NOT_REPRODUCIBLE` → no PR. Most non-clean-regression CI failures land here — a safe, silent default.
- LLM non-convergence / verify failure → `NEEDS_HUMAN` → no PR (a non-green fix never becomes a PR).
- Infra failure (Docker/DB/API) → `InfrastructureFailure` → the workflow fails loudly (retriable), never a false PR.
- GitHub API failure → recorded on `ExternalAction`; no half-written state.

## 7. Testing strategy

- **Hermetic unit tests** (`pnpm test`; no network/Docker/API): `CiDefectSource` (mock CI report + mock git → baseline resolver logic + signature extraction), `DraftPublisher` (mock `GitHubClient` → idempotency/dedup, branch + PR body construction), holdout related-tests selection. Injected seams, matching the existing mock-exec / mock-model discipline.
- **End-to-end smoke** (`pnpm remediation:ci`, local): a throwaway clone with a planted regression + real `LlmRepairer`, with GitHub calls in dry-run. The real `remediation.yml` is validated once by running it on a deliberately-regressed test branch/PR.
- **Kernel/substrate/LlmRepairer unchanged** — already covered.
- `pnpm test` stays hermetic: real GitHub/Docker/model only in the smoke + CI, never unit tests.

## 8. New code (all small, on existing seams)

- `src/lib/agents/remediation/sources/defectSource.ts` — the `DefectSource` interface + the `{ incident, fixture }` shape.
- `src/lib/agents/remediation/sources/ciDefectSource.ts` — signature extraction + baseline resolver + related-tests holdout.
- `src/lib/agents/remediation/publish/githubDraft.ts` — `DraftPublisher` + the `GitHubClient` seam.
- `scripts/agents/remediation-ci.ts` — the `pnpm remediation:ci` entrypoint (orchestration).
- `.github/workflows/test.yml` + `.github/workflows/remediation.yml`.
- Hermetic tests for each new unit.
- **No changes** to the kernel, state machine, verify, substrate, or `LlmRepairer`.

## 9. Scope boundary

Does NOT include: sub-project 2 (Sentry); fork-PR branch push (comment fallback only); non-regression defects (out of scope, produce no PR); airtight false-fix proof (best-effort holdout + human backstop). These are explicit, safe limitations for v1.
