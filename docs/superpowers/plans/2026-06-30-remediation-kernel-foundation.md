# Remediation Kernel Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest runnable remediation kernel foundation: an explicit state machine, lease-guarded CAS transitions, a dedicated test-database lock, generated regression fixtures with real Git commits, and a local smoke command.

**Architecture:** Keep remediation state separate from the existing SDLC `AgentRun` pipeline. Pure transition rules live in one module; Prisma persistence applies those rules atomically and requires an active lease. Test commands use an explicit remediation-only database and a transaction-scoped Postgres advisory lock. Fixture repositories are generated locally so every regression has a real known-good and defective commit without checking fake SHAs into the repository.

**Tech Stack:** TypeScript, Vitest, Prisma 5, PostgreSQL advisory locks, Zod, Node `child_process`, Git worktrees.

---

## Scope Boundary

This plan is the first foundation slice, not the whole K0–K3 roadmap. It deliberately excludes LLM triage, CodeGraph related-test selection, 60-run trusted-set certification, repair generation, verification hashes, and Draft PR artifacts. It must leave the existing SDLC pipeline and `MockTicket` behavior unchanged.

## File Map

- Create `src/lib/agents/remediation/types.ts`: phases, terminal states, transition table, fixture types.
- Create `src/lib/agents/remediation/state.ts`: pure transition validation.
- Create `src/lib/agents/remediation/state.test.ts`: exhaustive state-machine tests.
- Modify `prisma/schema.prisma`: `Incident` and `RemediationRun` foundation models.
- Create `src/lib/agents/remediation/store.ts`: incident deduplication, lease claim, heartbeat, CAS transition.
- Create `src/lib/agents/remediation/store.test.ts`: database-backed concurrency and transition tests.
- Create `src/lib/agents/remediation/testDatabase.ts`: dedicated URL validation and advisory-lock wrapper.
- Create `src/lib/agents/remediation/testDatabase.test.ts`: URL and lock serialization tests.
- Create `src/lib/agents/remediation/fixtures.ts`: generated Git fixture repository helper.
- Create `src/lib/agents/remediation/fixtures.test.ts`: known-good/defective commit tests.
- Create `scripts/agents/remediation-smoke.ts`: local end-to-end state/fixture smoke command.
- Modify `package.json`: add `remediation:smoke` command.

### Task 1: Define the Pure State Machine

**Files:**
- Create: `src/lib/agents/remediation/types.ts`
- Create: `src/lib/agents/remediation/state.ts`
- Test: `src/lib/agents/remediation/state.test.ts`

- [ ] **Step 1: Write the failing transition tests**

Create `src/lib/agents/remediation/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./state";
import { REMEDIATION_PHASES, TERMINAL_PHASES, type RemediationPhase } from "./types";

describe("remediation phase state machine", () => {
  const forward: Array<[RemediationPhase, RemediationPhase]> = [
    ["RECEIVED", "TRIAGING"],
    ["TRIAGING", "CLASSIFIED"],
    ["CLASSIFIED", "REPRODUCING"],
    ["REPRODUCING", "FIXING"],
    ["FIXING", "VERIFYING"],
    ["VERIFYING", "PROPOSING"],
    ["PROPOSING", "PROPOSED"],
  ];

  it.each(forward)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each([
    ["REPRODUCING", "NOT_REPRODUCIBLE"],
    ["REPRODUCING", "ALREADY_FIXED"],
    ["REPRODUCING", "NEEDS_HUMAN"],
    ["FIXING", "NEEDS_HUMAN"],
    ["VERIFYING", "NEEDS_HUMAN"],
    ["TRIAGING", "FAILED"],
    ["VERIFYING", "FAILED"],
    ["CLASSIFIED", "CANCELLED"],
  ] satisfies Array<[RemediationPhase, RemediationPhase]>)
    ("allows terminal edge %s → %s", (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });

  it.each(TERMINAL_PHASES)("does not leave terminal state %s", (from) => {
    for (const to of REMEDIATION_PHASES) expect(canTransition(from, to)).toBe(false);
  });

  it("rejects skipped and backward phases", () => {
    expect(canTransition("RECEIVED", "FIXING")).toBe(false);
    expect(canTransition("VERIFYING", "FIXING")).toBe(false);
    expect(() => assertTransition("RECEIVED", "FIXING")).toThrow(
      "invalid remediation transition RECEIVED → FIXING",
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test -- src/lib/agents/remediation/state.test.ts
```

Expected: FAIL because `./state` and `./types` do not exist.

- [ ] **Step 3: Add phases and explicit transition rules**

Create `src/lib/agents/remediation/types.ts`:

```ts
export const ACTIVE_PHASES = [
  "RECEIVED",
  "TRIAGING",
  "CLASSIFIED",
  "REPRODUCING",
  "FIXING",
  "VERIFYING",
  "PROPOSING",
] as const;

export const TERMINAL_PHASES = [
  "PROPOSED",
  "ALREADY_FIXED",
  "NOT_REPRODUCIBLE",
  "NEEDS_HUMAN",
  "FAILED",
  "CANCELLED",
] as const;

export const REMEDIATION_PHASES = [...ACTIVE_PHASES, ...TERMINAL_PHASES] as const;
export type RemediationPhase = (typeof REMEDIATION_PHASES)[number];
```

Create `src/lib/agents/remediation/state.ts`:

```ts
import type { RemediationPhase } from "./types";

const EDGES: Readonly<Record<RemediationPhase, readonly RemediationPhase[]>> = {
  RECEIVED: ["TRIAGING", "FAILED", "CANCELLED"],
  TRIAGING: ["CLASSIFIED", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  CLASSIFIED: ["REPRODUCING", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  REPRODUCING: ["FIXING", "ALREADY_FIXED", "NOT_REPRODUCIBLE", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  FIXING: ["VERIFYING", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  VERIFYING: ["PROPOSING", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  PROPOSING: ["PROPOSED", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  PROPOSED: [],
  ALREADY_FIXED: [],
  NOT_REPRODUCIBLE: [],
  NEEDS_HUMAN: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: RemediationPhase, to: RemediationPhase): boolean {
  return EDGES[from].includes(to);
}

export function assertTransition(from: RemediationPhase, to: RemediationPhase): void {
  if (!canTransition(from, to)) throw new Error(`invalid remediation transition ${from} → ${to}`);
}
```

- [ ] **Step 4: Run the state-machine test**

Run:

```bash
pnpm test -- src/lib/agents/remediation/state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the pure state machine**

```bash
git add src/lib/agents/remediation/types.ts src/lib/agents/remediation/state.ts src/lib/agents/remediation/state.test.ts
git commit -m "feat(remediation): define explicit phase state machine"
```

### Task 2: Add Durable Incident and Run Models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/agents/remediation/store.ts`
- Test: `src/lib/agents/remediation/store.test.ts`

- [ ] **Step 1: Add database-backed failing tests for deduplication and lease CAS**

Create `src/lib/agents/remediation/store.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { claimRun, heartbeatRun, ingestIncident, transitionRun } from "./store";

afterEach(async () => {
  await prisma.remediationRun.deleteMany();
  await prisma.incident.deleteMany();
});

describe("remediation store", () => {
  it("deduplicates incidents and increments occurrences", async () => {
    const first = await ingestIncident({
      repository: "rpas-lms",
      defaultBranch: "feat/sdlc-agent",
      fingerprint: "typeerror:scoreExam:34",
      payload: { eventId: "one" },
    });
    const second = await ingestIncident({
      repository: "rpas-lms",
      defaultBranch: "feat/sdlc-agent",
      fingerprint: "typeerror:scoreExam:34",
      payload: { eventId: "two" },
    });

    expect(second.id).toBe(first.id);
    expect(second.occurrenceCount).toBe(2);
    expect(JSON.parse(second.latestPayload)).toEqual({ eventId: "two" });
  });

  it("allows exactly one lease claimant", async () => {
    const incident = await ingestIncident({
      repository: "rpas-lms",
      defaultBranch: "feat/sdlc-agent",
      fingerprint: "lease-race",
      payload: {},
    });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });

    const claims = await Promise.all([
      claimRun(run.id, "worker-a", 60_000),
      claimRun(run.id, "worker-b", 60_000),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("requires the active lease owner for a CAS transition", async () => {
    const incident = await ingestIncident({
      repository: "rpas-lms",
      defaultBranch: "feat/sdlc-agent",
      fingerprint: "transition-lease",
      payload: {},
    });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });
    expect(await claimRun(run.id, "worker-a", 60_000)).toBe(true);

    await expect(transitionRun(run.id, "worker-b", "RECEIVED", "TRIAGING")).rejects.toThrow("lost lease or CAS race");
    await transitionRun(run.id, "worker-a", "RECEIVED", "TRIAGING");
    await expect(transitionRun(run.id, "worker-a", "RECEIVED", "FIXING")).rejects.toThrow();

    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.phase).toBe("TRIAGING");
  });

  it("heartbeats only for the active lease owner", async () => {
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "heartbeat", payload: {} });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });
    await claimRun(run.id, "worker-a", 60_000);
    expect(await heartbeatRun(run.id, "worker-b", 60_000)).toBe(false);
    expect(await heartbeatRun(run.id, "worker-a", 60_000)).toBe(true);
  });
});
```

- [ ] **Step 2: Add the Prisma models and generate the client**

Append to `prisma/schema.prisma` without modifying `AgentRun`, `AgentStep`, or `MockTicket`:

```prisma
model Incident {
  id              String           @id @default(cuid())
  repository      String
  defaultBranch   String
  fingerprint     String
  occurrenceCount Int              @default(1)
  latestPayload   String
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  runs            RemediationRun[]

  @@unique([repository, defaultBranch, fingerprint])
}

model RemediationRun {
  id             String   @id @default(cuid())
  incidentId     String
  incident       Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  phase          String   @default("RECEIVED")
  leaseOwner     String?
  leaseExpiresAt DateTime?
  escalatedAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([incidentId])
  @@index([phase, leaseExpiresAt])
}
```

Run:

```bash
pnpm db:generate
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" pnpm exec prisma db push
```

Expected: Prisma client generation succeeds and the test database gains both tables. Do not run `prisma db push` unless `TEST_DATABASE_URL` is explicitly set to a disposable local database.

- [ ] **Step 3: Verify the new tests fail because the store is missing**

Run:

```bash
pnpm test -- src/lib/agents/remediation/store.test.ts
```

Expected: FAIL because `./store` does not exist.

- [ ] **Step 4: Implement the minimal Prisma store**

Create `src/lib/agents/remediation/store.ts`:

```ts
import { prisma } from "../../db";
import { assertTransition } from "./state";
import type { RemediationPhase } from "./types";

type IncidentInput = {
  repository: string;
  defaultBranch: string;
  fingerprint: string;
  payload: unknown;
};

export function ingestIncident(input: IncidentInput) {
  const { repository, defaultBranch, fingerprint, payload } = input;
  const key = {
    repository_defaultBranch_fingerprint: {
      repository,
      defaultBranch,
      fingerprint,
    },
  };
  return prisma.incident.upsert({
    where: key,
    create: { repository, defaultBranch, fingerprint, latestPayload: JSON.stringify(payload) },
    update: { occurrenceCount: { increment: 1 }, latestPayload: JSON.stringify(payload) },
  });
}

export async function claimRun(runId: string, workerId: string, leaseMs: number): Promise<boolean> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimed = await prisma.remediationRun.updateMany({
    where: {
      id: runId,
      OR: [{ leaseOwner: null }, { leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    },
    data: { leaseOwner: workerId, leaseExpiresAt },
  });
  return claimed.count === 1;
}

export async function heartbeatRun(runId: string, workerId: string, leaseMs: number): Promise<boolean> {
  const now = new Date();
  const updated = await prisma.remediationRun.updateMany({
    where: { id: runId, leaseOwner: workerId, leaseExpiresAt: { gt: now } },
    data: { leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
  return updated.count === 1;
}

export async function transitionRun(
  runId: string,
  workerId: string,
  expected: RemediationPhase,
  next: RemediationPhase,
): Promise<void> {
  assertTransition(expected, next);
  const updated = await prisma.remediationRun.updateMany({
    where: { id: runId, phase: expected, leaseOwner: workerId, leaseExpiresAt: { gt: new Date() } },
    data: { phase: next },
  });
  if (updated.count !== 1) throw new Error(`run ${runId} lost lease or CAS race`);
}
```

- [ ] **Step 5: Run store and existing pipeline tests**

Run:

```bash
pnpm test -- src/lib/agents/remediation/store.test.ts src/lib/agents/pipeline.test.ts
```

Expected: PASS; the existing SDLC state machine remains unchanged.

- [ ] **Step 6: Commit durable state**

```bash
git add prisma/schema.prisma src/lib/agents/remediation/store.ts src/lib/agents/remediation/store.test.ts
git commit -m "feat(remediation): add lease-guarded durable state"
```

### Task 3: Isolate and Serialize the Remediation Test Database

**Files:**
- Create: `src/lib/agents/remediation/testDatabase.ts`
- Test: `src/lib/agents/remediation/testDatabase.test.ts`

- [ ] **Step 1: Write failing URL-safety and lock tests**

Create `src/lib/agents/remediation/testDatabase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { remediationDatabaseUrl, withRemediationDatabaseLock } from "./testDatabase";

describe("remediation test database", () => {
  it("rejects a missing or ordinary developer database URL", () => {
    expect(() => remediationDatabaseUrl(undefined)).toThrow("REMEDIATION_TEST_DATABASE_URL is required");
    expect(() => remediationDatabaseUrl("postgresql://postgres:postgres@localhost:5433/postgres")).toThrow(
      "dedicated database",
    );
  });

  it("accepts an explicitly named remediation database", () => {
    expect(remediationDatabaseUrl("postgresql://postgres:postgres@localhost:5433/rpas_remediation_test")).toContain(
      "/rpas_remediation_test",
    );
  });

  it("serializes two holders of the same advisory lock", async () => {
    const url = remediationDatabaseUrl(process.env.REMEDIATION_TEST_DATABASE_URL);
    const a = new PrismaClient({ datasources: { db: { url } } });
    const b = new PrismaClient({ datasources: { db: { url } } });
    const order: string[] = [];
    let releaseA!: () => void;
    let enteredA!: () => void;
    const aMayExit = new Promise<void>((resolve) => { releaseA = resolve; });
    const aEntered = new Promise<void>((resolve) => { enteredA = resolve; });
    try {
      const first = withRemediationDatabaseLock(a, "rpas-lms", async () => {
        order.push("a:start");
        enteredA();
        await aMayExit;
        order.push("a:end");
      });
      await aEntered;
      const second = withRemediationDatabaseLock(b, "rpas-lms", async () => {
        order.push("b:start");
        order.push("b:end");
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(order).toEqual(["a:start"]);
      releaseA();
      await Promise.all([first, second]);
      expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
    } finally {
      await Promise.all([a.$disconnect(), b.$disconnect()]);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run with a separately created local database:

```bash
docker exec rpas-test-pg createdb -U postgres rpas_remediation_test
REMEDIATION_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/rpas_remediation_test \
pnpm test -- src/lib/agents/remediation/testDatabase.test.ts
```

Expected: `createdb` succeeds (or reports that the dedicated database already exists), then Vitest FAILS because `./testDatabase` does not exist. Never substitute `/postgres`.

- [ ] **Step 3: Implement fail-closed URL validation and transaction lock**

Create `src/lib/agents/remediation/testDatabase.ts`:

```ts
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export function remediationDatabaseUrl(raw: string | undefined): string {
  if (!raw) throw new Error("REMEDIATION_TEST_DATABASE_URL is required");
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");
  if (!database || database === "postgres" || !database.includes("remediation")) {
    throw new Error("remediation tests require a dedicated database whose name contains remediation");
  }
  return url.toString();
}

function advisoryKey(repository: string): bigint {
  const bytes = createHash("sha256").update(repository).digest().subarray(0, 8);
  return bytes.readBigInt64BE();
}

export async function withRemediationDatabaseLock<T>(
  client: PrismaClient,
  repository: string,
  work: () => Promise<T>,
): Promise<T> {
  return client.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${advisoryKey(repository)})`;
      return work();
    },
    { timeout: 10 * 60_000 },
  );
}
```

- [ ] **Step 4: Run the database-lock tests twice**

Run:

```bash
REMEDIATION_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/rpas_remediation_test \
pnpm test -- src/lib/agents/remediation/testDatabase.test.ts
```

Expected: PASS twice; the order proves the two clients never enter the critical section together.

- [ ] **Step 5: Commit test-database isolation**

```bash
git add src/lib/agents/remediation/testDatabase.ts src/lib/agents/remediation/testDatabase.test.ts
git commit -m "feat(remediation): isolate and lock test database"
```

### Task 4: Generate a Real Regression Fixture Repository

**Files:**
- Create: `src/lib/agents/remediation/fixtures.ts`
- Test: `src/lib/agents/remediation/fixtures.test.ts`

- [ ] **Step 1: Write the failing fixture test**

Create `src/lib/agents/remediation/fixtures.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRegressionFixture, type RegressionFixture } from "./fixtures";

const execFileAsync = promisify(execFile);
const created: RegressionFixture[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((fixture) => fixture.cleanup()));
});

describe("regression fixture repository", () => {
  it("creates distinct known-good and defective commits", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    expect(fixture.knownGoodCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.defectiveCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.defectiveCommit).not.toBe(fixture.knownGoodCommit);

    const good = await execFileAsync("git", ["show", `${fixture.knownGoodCommit}:src/score.ts`], { cwd: fixture.repoRoot });
    const bad = await execFileAsync("git", ["show", `${fixture.defectiveCommit}:src/score.ts`], { cwd: fixture.repoRoot });
    expect(good.stdout).toContain("answers[index]?.score ?? 0");
    expect(bad.stdout).toContain("answers[index].score");
  });
});
```

- [ ] **Step 2: Run the fixture test and verify it fails**

Run:

```bash
pnpm test -- src/lib/agents/remediation/fixtures.test.ts
```

Expected: FAIL because `./fixtures` does not exist.

- [ ] **Step 3: Implement the generated two-commit fixture**

Create `src/lib/agents/remediation/fixtures.ts`:

```ts
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RegressionFixture = {
  repoRoot: string;
  knownGoodCommit: string;
  defectiveCommit: string;
  incident: {
    fingerprint: "TypeError:score:score.ts";
    errorType: "TypeError";
    sourceFile: "src/score.ts";
    symbol: "score";
  };
  cleanup: () => Promise<void>;
};

const GOOD_SOURCE = `export function score(answers: Array<{ score: number }>, index: number): number {
  return answers[index]?.score ?? 0;
}\n`;

const BAD_SOURCE = `export function score(answers: Array<{ score: number }>, index: number): number {
  return answers[index].score;
}\n`;

const TEST_SOURCE = `import { expect, it } from "vitest";
import { score } from "./score";

it("returns zero for a missing answer", () => {
  expect(score([], 0)).toBe(0);
});\n`;

export async function createRegressionFixture(): Promise<RegressionFixture> {
  const repoRoot = await mkdtemp(join(tmpdir(), "remediation-fixture-"));
  const git = (args: string[]) => execFileAsync("git", args, { cwd: repoRoot });
  try {
    await mkdir(join(repoRoot, "src"));
    await git(["init", "--initial-branch=main"]);
    await git(["config", "user.name", "Remediation Fixture"]);
    await git(["config", "user.email", "fixture@example.invalid"]);
    await writeFile(join(repoRoot, "src/score.ts"), GOOD_SOURCE);
    await writeFile(join(repoRoot, "src/score.test.ts"), TEST_SOURCE);
    await git(["add", "src/score.ts", "src/score.test.ts"]);
    await git(["commit", "-m", "fixture: known good"]);
    const knownGoodCommit = (await git(["rev-parse", "HEAD"])).stdout.trim();

    await writeFile(join(repoRoot, "src/score.ts"), BAD_SOURCE);
    await git(["add", "src/score.ts"]);
    await git(["commit", "-m", "fixture: introduce regression"]);
    const defectiveCommit = (await git(["rev-parse", "HEAD"])).stdout.trim();

    return {
      repoRoot,
      knownGoodCommit,
      defectiveCommit,
      incident: {
        fingerprint: "TypeError:score:score.ts",
        errorType: "TypeError",
        sourceFile: "src/score.ts",
        symbol: "score",
      },
      cleanup: () => rm(repoRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(repoRoot, { recursive: true, force: true });
    throw error;
  }
}
```

- [ ] **Step 4: Run the fixture test**

Run:

```bash
pnpm test -- src/lib/agents/remediation/fixtures.test.ts
```

Expected: PASS and leave no fixture directory behind.

- [ ] **Step 5: Commit fixture generation**

```bash
git add src/lib/agents/remediation/fixtures.ts src/lib/agents/remediation/fixtures.test.ts
git commit -m "test(remediation): generate regression fixture commits"
```

### Task 5: Add a Local Kernel Smoke Command

**Files:**
- Create: `scripts/agents/remediation-smoke.ts`
- Modify: `package.json`
- Test: existing focused remediation tests

- [ ] **Step 1: Add the smoke script**

Create `scripts/agents/remediation-smoke.ts`. It must:

```ts
import "../eval/loadEnv";
import { prisma } from "../../src/lib/db";
import { createRegressionFixture } from "../../src/lib/agents/remediation/fixtures";
import { claimRun, ingestIncident, transitionRun } from "../../src/lib/agents/remediation/store";

async function main(): Promise<void> {
  const fixture = await createRegressionFixture();
  try {
    const incident = await ingestIncident({
      repository: "generated-remediation-fixture",
      defaultBranch: "main",
      fingerprint: fixture.incident.fingerprint,
      payload: {
        ...fixture.incident,
        knownGoodCommit: fixture.knownGoodCommit,
        defectiveCommit: fixture.defectiveCommit,
      },
    });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });
    if (!(await claimRun(run.id, "smoke-worker", 60_000))) throw new Error("smoke worker failed to claim run");

    await transitionRun(run.id, "smoke-worker", "RECEIVED", "TRIAGING");
    await transitionRun(run.id, "smoke-worker", "TRIAGING", "CLASSIFIED");
    await transitionRun(run.id, "smoke-worker", "CLASSIFIED", "REPRODUCING");

    console.log(JSON.stringify({
      incidentId: incident.id,
      runId: run.id,
      phase: "REPRODUCING",
      knownGoodCommit: fixture.knownGoodCommit,
      defectiveCommit: fixture.defectiveCommit,
    }));
  } finally {
    await fixture.cleanup();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

This command exercises durable state in the normal locally configured application/test database. `REMEDIATION_TEST_DATABASE_URL` is reserved for running code-under-repair and is not the remediation state store. Do not invoke an LLM, modify the existing `AgentRun`, create a `MockTicket`, or run a repair.

- [ ] **Step 2: Add the package command**

Add to `package.json` scripts:

```json
"remediation:smoke": "tsx scripts/agents/remediation-smoke.ts"
```

- [ ] **Step 3: Run the smoke command**

Run:

```bash
REMEDIATION_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/rpas_remediation_test \
pnpm remediation:smoke
```

Expected: exit 0 and one JSON object whose `phase` is `REPRODUCING` and whose two commit SHAs differ.

- [ ] **Step 4: Run the focused regression suite and typecheck**

Run:

```bash
pnpm test -- src/lib/agents/remediation src/lib/agents/pipeline.test.ts src/lib/agents/sdlc/tickets.test.ts
pnpm typecheck
```

Expected: all tests PASS and typecheck exits 0.

- [ ] **Step 5: Inspect the final diff boundary**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Only remediation foundation files, `prisma/schema.prisma`, and `package.json` from this plan are changed; pre-existing user changes remain untouched.

- [ ] **Step 6: Commit the smoke command**

```bash
git add scripts/agents/remediation-smoke.ts package.json
git commit -m "feat(remediation): add kernel smoke command"
```

## Completion Evidence

The foundation slice is complete only when all of the following are captured in the handoff:

- focused test command and passing count;
- successful typecheck;
- successful smoke JSON with distinct fixture SHAs;
- demonstration that two lease claims yield one winner;
- demonstration that two advisory-lock clients serialize;
- confirmation that existing SDLC pipeline tests still pass;
- final changed-file list excluding pre-existing user changes.

The next plan should build reproduction worktrees and signature matching on this foundation. It must not begin until this slice passes and its data/lease boundaries have been reviewed in code.
