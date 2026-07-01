# Auto-Fix Remediation Kernel

Status: Revised design draft for review

Current milestone: learning sandbox with mock adapters

Future milestone: production integrations, explicitly frozen

## 1. Scope Decision

This project is currently a mechanism-learning sandbox, not a production incident-remediation service. `rpas-lms` has not accumulated production incidents, so building and operating real Sentry ingestion, a GitHub App, a deployed worker, repository rulesets, and production secrets now would be premature.

The work is split into two independent milestones:

### Build now: mechanism kernel

- mock health signals and incident fixtures;
- durable Incident and RemediationRun state;
- deterministic policy decisions;
- lease, heartbeat, retry, and state-transition behavior;
- production-SHA-style reproduction using fixture commits;
- latest-main-style repair in a second clean worktree;
- constrained repair and deterministic verification;
- mock escalation and mock Draft PR publication.

This milestone proves whether the mechanism is safe, understandable, recoverable, and useful. It does not require production infrastructure.

### Frozen: production adapters and operations

- signed Sentry webhook ingestion and polling reconciliation;
- a continuously deployed remediation worker;
- GitHub App authentication and real Draft PR publication;
- repository rulesets and bot identity restrictions;
- production secrets, test services, cleanup jobs, quotas, and rollout.

Frozen work must not be pulled into the current implementation merely because interfaces for it exist.

Production work may be reconsidered only after all of these conditions are true:

1. `rpas-lms` is launched and emits trustworthy production signals.
2. At least three real, repository-local incidents have been reproduced manually.
3. The new remediation-kernel CLI has completed its reproduction, repair, and verification path for at least one real defect. This refers to the redesigned kernel path, not the current legacy `pnpm autofix` prototype.
4. The team still judges automation more valuable than improving ordinary diagnostics and tests.

The number three is an activation checkpoint, not evidence that three incidents form a useful classifier. The decision remains a human design review based on the incidents themselves.

## 2. Intended Value and Operating Characteristic

The current system's primary value is:

1. triage and evidence collection;
2. consistent escalation and handoff;
3. a verified Draft PR proposal for the small subset of suitable incidents.

This is deliberately a high-precision, low-recall system. Concurrency failures, environment configuration, dirty data, external-service behavior, performance failures, and production-only authorization boundaries will often end in `NOT_REPRODUCIBLE` or `NEEDS_HUMAN`. That is a safe and useful result when accompanied by strong evidence.

The initial Draft PR conversion rate may be in the single-digit percentages. This is a planning assumption, not a success target. The system must not weaken its gates to increase that number.

## 3. Authority and Safety Decisions

- The model recommends; deterministic code authorizes.
- The maximum future autonomous action is an isolated branch and GitHub Draft PR.
- A human always decides whether to merge or deploy.
- Escalation can happen immediately while an eligible isolated repair attempt continues.
- Eligibility is based on required capabilities and environmental constraints, not severity alone.
- No repair is presented as verified without a matching reproduction and red-to-green evidence.
- The worker cannot access production data, production credentials, merge APIs, deploy APIs, repository settings, or branch-protection controls.
- Current-milestone publishers and escalation sinks are mocks.

## 4. Current-Milestone Architecture

```mermaid
flowchart TD
    FS["Fixture Signal Adapter"] --> IS["Incident Store and Deduplication"]
    IS --> TA["Triage Agent"]
    TA --> PE["Deterministic Policy Engine"]
    PE --> ME["Mock Escalation Sink"]
    PE --> RW["Local Remediation Worker"]
    RW --> PW["Fixture Production-SHA Worktree"]
    PW --> RM{"Failure signature matches incident?"}
    RM -- "No failure" --> NR["NOT_REPRODUCIBLE"]
    RM -- "Wrong failure" --> NH1["NEEDS_HUMAN"]
    RM -- "Matches" --> MW["Latest-main Worktree"]
    MW --> TP{"Test applies and compiles?"}
    TP -- "No" --> NH2["NEEDS_HUMAN"]
    TP -- "Yes, already green" --> AF["ALREADY_FIXED"]
    TP -- "Yes, still red" --> MM{"Signature still matches?"}
    MM -- "No" --> NH4["NEEDS_HUMAN"]
    MM -- "Yes" --> FX["Constrained Auto-Fix Agent"]
    FX --> VE["Deterministic Verification"]
    VE --> VG{"All gates pass?"}
    VG -- "No" --> NH3["NEEDS_HUMAN"]
    VG -- "Yes" --> MP["Mock Draft PR Artifact"]
```

The database owns workflow state. Temporary worktrees are disposable execution environments. External systems are adapters, never the source of truth.

## 5. Component Responsibilities

### 5.1 Fixture Signal Adapter

Loads versioned incident fixtures that contain:

- a stable fingerprint;
- a fixture deployment commit;
- error type and stack frames;
- bounded event metadata;
- expected routing outcome.

Fixtures must include reproducible, already-fixed, wrong-failure, non-portable-test, policy-denied, and human-only cases.

### 5.2 Triage Agent

Triage is the diagnostic and routing layer. It correlates signals, inspects runtime evidence and code, proposes the likely cause, identifies ownership and required capabilities, and produces a validated assessment.

It does not edit code, grant itself authority, publish a PR, merge, deploy, or close an incident based on model confidence.

Its useful output exists even when no repair is attempted:

```ts
type TriageAssessment = {
  incidentFingerprint: string;
  severity: "P0" | "P1" | "P2" | "P3";
  suspectedRootCause: string;
  suspectedFiles: string[];
  deployedCommit: string;
  owningTeam: string;
  reproducibility: "likely" | "unknown" | "unlikely";
  requiredCapabilities: string[];
  escalationRecommended: boolean;
  autoFixRecommended: boolean;
  evidence: EvidenceReference[];
};
```

### 5.3 CodeGraph Evidence Provider

CodeGraph is a read-only grounding tool. It helps triage locate stack symbols and callers, helps reproduction find test seams, and helps review explain blast radius. It is neither a runtime oracle nor proof that a repair works.

Every query must be bound to the actual worktree and revision:

```ts
interface CodeSearch {
  explore(input: {
    query: string;
    repoRoot: string;
    revision: string;
  }): Promise<CodeEvidence>;
}
```

Using `process.cwd()` implicitly is unsafe when multiple worktrees exist.

### 5.4 Deterministic Policy Engine

The Policy Engine decides whether escalation is required, whether an attempt may start, and which limits apply. LLM output is evidence, not authorization.

An attempt is denied or escalated when it requires production credentials, production data mutation, destructive schema work, infrastructure changes, secret changes, deployment changes, an unbounded edit surface, or an unavailable local environment.

Initial repair limits:

- at most five changed files;
- at most 200 changed lines including the test;
- at most two model repair iterations;
- no writes to `.git`, `.env*`, `.github/workflows`, deployment files, infrastructure configuration, secrets, or `prisma/migrations`.

### 5.5 Local Remediation Worker

The current worker is an on-demand local process. It claims one run with a lease, heartbeats while working, records transitions, and safely resumes or expires abandoned work.

Worktree creation may be concurrent, but database-backed test execution may not be. This repository's Vitest configuration points every worktree at the same Postgres database on port 5433, and global setup force-resets that database. The kernel therefore uses one repository-scoped test-execution mutex covering setup, reproduction, related tests, and full-suite verification.

For the current repository, the coordinator holds a Postgres advisory lock derived from the canonical repository identity for the entire lifetime of the spawned test process. All worktrees use the same lock key. Process or connection loss releases the lock; lease loss causes the coordinator to terminate the test child before releasing it. A worker must acquire this lock before invoking any command that can reset or use the shared test database.

Per-attempt databases or containers are a possible future optimization. They are not part of the current kernel because a single mutex is smaller and matches the repository's actual test infrastructure.

It is not yet a deployed service. Proving lease semantics locally is part of the mechanism exercise; operating a self-hosted runner is not.

### 5.6 Reproduction Agent

The reproduction agent may add or adjust only a bounded test and supporting test fixture in a clean worktree at the fixture deployment commit. It records the command, exit code, bounded logs, and observed failure signature.

A fixture repository must include a known-good commit immediately before the fixture defect. A test is accepted as a reproduction only when:

1. it passes on the known-good control commit;
2. it fails on the fixture deployment commit;
3. its observed failure signature matches the incident signature;
4. the failure is stable across repeated execution;
5. unrelated baseline tests do not fail.

There is no missing-control exception in the mechanism kernel. A future production design may classify an incident without a known-good commit as `NEEDS_HUMAN`, but it may not silently waive the control. Failure to meet these conditions produces evidence and stops automated repair.

### 5.7 Constrained Auto-Fix Agent

The fix agent receives a fresh latest-main worktree plus the accepted reproduction test. At acceptance time, the kernel records the byte-level hash of every test and fixture file that constitutes the reproduction. Those paths are removed from the fix agent's writable set, even if their parent directory would otherwise be allowed.

Before and after every repair iteration, and again during final verification, the kernel recomputes the hashes. A missing file, changed byte, symlink substitution, or path replacement fails the attempt immediately. The agent cannot weaken, skip, delete, or replace the accepted reproduction to make it pass.

### 5.8 Deterministic Verification

Verification is ordinary code. It checks:

1. the accepted test failed with a matching signature before the fix;
2. the same test passes after the fix;
3. related tests pass;
4. the complete trusted test set passes while holding the repository test mutex;
5. type and schema checks pass;
6. diff and path policies pass;
7. accepted reproduction hashes are unchanged and no test, configuration, or policy weakening occurred.

The verifier can prove these observations. It cannot prove semantic correctness in general.

### 5.9 Mock Publisher and Escalation Sink

The current publisher writes a durable Draft PR-shaped artifact without network access. The mock escalation sink records who would be notified and why. These artifacts make idempotency and audit behavior testable without creating operational dependencies.

## 6. Matching a Reproduction to the Incident

“Fails for the expected reason” is not treated as a deterministic proof. It is a constrained matching rule.

The normalized incident signature contains:

```ts
type FailureSignature = {
  errorType: string;
  normalizedMessageClass?: string;
  applicationFrames: Array<{
    module: string;
    symbol?: string;
  }>;
};
```

The first kernel version accepts a reproduction only at high confidence:

- the error type matches;
- the top application frame maps through source maps to the same source file and either the same symbol or reviewed line range;
- when a second application frame exists, its mapped source file and symbol or line range also match.

Symbol and source-location evidence is mandatory when it exists in either signature. Matching only by module is classified as low confidence and cannot authorize auto-fix. Missing or unusable source maps likewise produce `NEEDS_HUMAN`; the kernel does not compensate by broadening the matcher.

This remains a heuristic. The first question in the human review checklist is therefore: “Does the red test fail for the same underlying reason as the incident?” The Draft PR artifact must show the incident and test signatures side by side.

## 7. Two-Worktree Flow and Test Portability

1. Create a clean reproduction worktree at the fixture deployment commit.
2. Produce and validate the matching red test there.
3. Create a separate clean worktree at latest main.
4. Attempt to apply only the reproduction test and required fixture changes.
5. Classify the result:
   - test applies, compiles, and is green: `ALREADY_FIXED`;
   - test applies, compiles, and remains red: continue to repair;
   - test cannot apply or compile because the seam changed: `NEEDS_HUMAN`;
   - test fails with a different signature: `NEEDS_HUMAN`.

The non-portable case is not evidence of an existing fix.

## 8. Durable State and Recovery

The mechanism kernel uses explicit records rather than a generic artifact blob:

- `Incident`: normalized identity, fingerprint, occurrence count, status, and latest evidence;
- `RemediationRun`: one workflow cycle and its phase;
- `RemediationAttempt`: lease, heartbeat, budgets, worktrees, and outcome;
- `Evidence`: immutable commands, bounded logs, signatures, code references, and test results;
- `ExternalAction`: idempotent mock publication or escalation intent.

State transitions use compare-and-set guards. A worker must hold the active lease to advance a run. Expired work may be reclaimed; external actions remain idempotent across retries.

## 9. Recurrence and Draft PR Idempotency

The stable key for an active remediation is:

```text
(repository, default branch, incident fingerprint)
```

Rules:

- repeated signals increment the occurrence count and attach new evidence to the same Incident;
- at most one open Draft PR artifact exists for that key;
- a newly verified attempt may append a new artifact version and mark the previous version `superseded`; evidence and prior artifact versions are never overwritten or deleted;
- an unverified recurrence is recorded but does not rewrite the proposal;
- if an earlier PR was merged or closed and the defect later recurs, create a new numbered remediation cycle linked to the prior cycle.

Future GitHub branch names include the fingerprint plus remediation-cycle number. They are not keyed by transient run ID.

## 10. MockTicket Has Two Separate Roles

`MockTicket` must not be discussed as one global concept:

1. In the existing SDLC `TICKETS` stage, it is a planning artifact and remains unchanged.
2. In the remediation prototype, it currently acts as glue between triage and auto-fix. That role is replaced by `Incident` and `RemediationRun` in the kernel.

This design does not remove or redesign the SDLC ticket stage.

## 11. Trusted Test Sets and Flakiness

“The full suite passes” is a meaningful gate only when the suite and its environment are sufficiently hermetic. Three clean runs do not establish that property.

Before the kernel can produce a verified Draft PR artifact:

- each test in the hard-gate trusted set must pass in 60 consecutive controlled baseline runs; this gives less than a 5% chance of missing a test that flakes independently 5% of the time;
- subsequent runs retain per-test pass/fail history, and any unexplained failure removes that test from the trusted set pending human review;
- required local services and fixture data must be reproducible;
- known flaky tests must be fixed or explicitly quarantined through human-reviewed, version-controlled test configuration;
- the auto-fix system may not silently ignore, retry away, or newly quarantine a failure.

The accepted reproduction and related tests are always hard gates. The full trusted set is also a hard gate. Quarantined tests are still executed as a separate diagnostic set, but their failures create visible warnings rather than changing a valid repair to `NEEDS_HUMAN`. A new failure outside the reviewed quarantine is reported separately from repair failure and stops publication.

This qualification is evidence about observed stability, not proof that a test can never flake.

## 12. Testing Strategy

Unit coverage includes fingerprinting, signature matching, policy decisions, transition guards, leases, path limits, verification classifications, and recurrence keys.

Integration scenarios include:

- duplicate fixtures produce one Incident;
- two workers race for one lease;
- two different attempts contend for the repository test mutex without overlapping database resets;
- a worker expires and another resumes safely;
- the red test matches the incident;
- the test is red for the wrong reason;
- latest main already contains a fix;
- the test cannot be ported to latest main;
- an eligible repair becomes a verified mock Draft PR;
- a recurrence updates one active cycle rather than producing duplicate proposals;
- a new flaky unrelated test prevents publication, while a reviewed quarantined failure remains a visible warning.

The end-to-end current-milestone path is:

```text
fixture signal
→ Incident
→ triage evidence
→ deterministic policy
→ matching red test
→ constrained repair
→ deterministic verification
→ one mock Draft PR artifact
```

## 13. Delivery Plan

### K0: Establish a trustworthy baseline

- preserve the existing SDLC pipeline and user changes;
- define versioned incident and repository fixtures;
- qualify the initial trusted test set with 60 controlled runs and record per-test outcomes;
- add the repository-scoped test-execution mutex around the shared Postgres lifecycle;
- document test-service setup and known non-hermetic tests.

Exit: the verification gate has a stable baseline.

### K1: Build the state and policy kernel

- add the minimal Incident, RemediationRun, Attempt, Evidence, and ExternalAction representation;
- implement transition guards, leases, heartbeat, expiry, retry, and cancellation;
- implement fixture ingress, deterministic policy, mock escalation, and mock publication.

Exit: crashes and duplicate fixture delivery do not create duplicate work or actions.

### K2: Prove reproduction semantics

- create known-good and defective fixture commits for reproducible, wrong-reason, already-fixed, and non-portable cases;
- implement revision-bound CodeGraph access;
- implement failure-signature matching;
- pin accepted reproduction files by hash and exclude them from the repair writable set;
- implement the two-worktree classification flow.

Exit: only a stable matching failure reaches repair.

### K3: Prove constrained repair and verification

- adapt the existing auto-fix primitive to the latest-main fixture worktree;
- enforce file, diff, command, iteration, and time budgets;
- implement deterministic gates and the human-review artifact;
- run the complete fixture matrix.

Exit: a mock Draft PR artifact is impossible without matching red-to-green evidence and every trusted gate passing.

## 14. Frozen Production Plan

After the activation conditions in Section 1 are met, production work requires a new design review. The likely sequence is:

1. real Sentry webhook plus polling reconciliation in shadow mode;
2. a separately deployed worker and real GitHub Draft PR publisher;
3. local-patch mode followed by restricted Draft PR mode.

That review must cover the operational surface currently out of scope:

- worker host, sandboxing, concurrency, cleanup, and availability;
- repository checkout and worktree storage;
- hermetic Postgres and other test services;
- GitHub App private key, webhook secret, and Sentry token storage and rotation;
- GitHub permissions and repository rulesets;
- per-incident model, compute, storage, and external API cost;
- quotas, abuse controls, audit retention, alerting, and disaster recovery.

Interfaces may anticipate these adapters, but current code must not implement them speculatively.

## 15. Metrics and Feedback

Report two value streams separately.

Triage and evidence value:

- percentage of incidents with useful ownership and evidence;
- time to first structured diagnosis;
- duplicate correlation rate;
- escalation usefulness and human correction rate;
- `NOT_REPRODUCIBLE` and `NEEDS_HUMAN` reason distribution.

Repair value:

- percentage reaching reproduction;
- percentage reaching a verified proposal;
- human acceptance, rejection, and false-fix rate;
- time from matching reproduction to proposal;
- cost per attempted and accepted repair.

The first version has no automatic policy-learning loop. Review outcomes are inspected periodically and policy configuration is changed manually through normal code review. High rejection rates in a module should cause humans to narrow or disable its eligibility.

## 16. Current-Milestone File Boundary

Expected new framework area:

```text
src/lib/agents/remediation/
  types.ts
  coordinator.ts
  lease.ts
  policy.ts
  worktrees.ts
  reproduction.ts
  verification.ts
```

Expected adapters:

```text
src/lib/agents/remediation/adapters/
  fixtureSignal.ts
  mockEscalation.ts
  mockPublisher.ts
```

Existing code may be adapted only where needed:

- triage becomes evidence-producing and revision-aware;
- auto-fix becomes a constrained repair primitive;
- local CLI commands trigger the coordinator;
- `prisma/schema.prisma` adds the minimal durable remediation models and uniqueness constraints;
- the SDLC PRD/RFC/TICKETS pipeline remains intact.

No Sentry route, GitHub client, deployed-worker entry point, repository ruleset, or production secret is part of this milestone.

## 17. Current-Milestone Acceptance Criteria

- Fixture duplicates create one Incident and increment occurrences.
- Policy decisions are reproducible and cannot be overridden by model output.
- Worker recovery does not duplicate attempts or external-action artifacts.
- Database-backed tests from separate worktrees never overlap against the shared test database.
- Every fixture reproduction passes on its mandatory known-good control commit before failing on the defective commit.
- Reproduction requires a stable failure whose signature matches the incident.
- Module-only signature similarity cannot authorize repair.
- A wrong-reason red test cannot reach repair.
- A non-portable test becomes `NEEDS_HUMAN`.
- An already-fixed case becomes `ALREADY_FIXED` without a proposal.
- A repair demonstrates matching red-to-green behavior and passes the trusted suite.
- Accepted reproduction files remain byte-identical throughout repair and verification.
- Recurrence creates at most one open proposal per fingerprint and cycle.
- Superseding a proposal appends an auditable version and preserves all prior evidence.
- MockTicket remains available to the SDLC `TICKETS` stage but is not remediation workflow state.
- Every model call, tool action, command, transition, decision, and result is auditable.
- All current-milestone tests run without Sentry, GitHub, deployed workers, or production credentials.

## 18. Non-Goals of the Current Milestone

- real Sentry ingestion;
- real GitHub publication;
- a continuously deployed worker;
- automatic merge or deployment;
- production database or infrastructure repair;
- secret or repository-setting changes;
- maximizing the number of generated patches;
- automatic learning from reviewer feedback;
- broad multi-repository remediation.
