# Plan 3 — Prisma/SQLite Persistence + Auth.js Accounts + Per-Question Review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make exam sessions survive server restarts (Prisma + SQLite), let users create accounts (Auth.js credentials) so their exam history attaches to them, and add a post-submission per-question review page (your answer vs. correct answer + explanation + reference).

**Architecture:** Persist only **User / ExamSession** in SQLite via Prisma — the question catalog stays in `content/question-bank.json` and grading stays in `src/lib/exam/**` exactly as today. A new `PrismaSessionStore` implements the existing `SessionStore` interface, so the `ExamService` is unchanged except for an optional `userId` on `createMock`. Auth is **additive, never gating**: middleware stays pure next-intl; the auth session is read only where useful (tag new sessions, dashboard history, header). Review reuses the in-memory bank to project explanations server-side, post-submission only.

**Tech Stack:** Next.js 15 App Router · Prisma 5 + SQLite · Auth.js v5 (`next-auth@beta`, Credentials provider, JWT sessions) · bcryptjs · Vitest.

---

## Conventions & Gotchas (read before starting any task)

- **Repo root:** `/Users/quzhenrong/rpas-lms`. The Bash cwd tends to reset to `$HOME` — prefix commands with `cd /Users/quzhenrong/rpas-lms &&` or use `git -C /Users/quzhenrong/rpas-lms`.
- **Package manager:** `pnpm` (v10). Node v20.14.
- **Import alias:** `@/*` → `src/*` resolves **only** in Next-compiled files (anything under `app/`). **Vitest does NOT resolve `@/`.** Therefore every file that is in the Vitest import graph — all of `src/lib/**`, every `*.test.ts`, the repo-root `auth.ts`, and any `app/api/**/route.ts` imported by `app/api/exam/routes.test.ts` — **must use relative imports** (`../db`, `../../../auth`, etc.). Only `app/` page/layout components (never imported by a test) may use `@/`.
- **DB in tests:** Vitest gets its own SQLite file `prisma/test.db`. `vitest.config.ts` sets `test.env.DATABASE_URL = "file:./test.db"` (used by the Prisma Client in worker processes) and a `globalSetup` runs `prisma db push --force-reset` against that same file before the suite. SQLite relative `file:` paths resolve relative to `prisma/schema.prisma`, so both CLI and Client land on `prisma/test.db`.
- **Switching `instance.ts` to Prisma (Task 3) makes `app/api/exam/routes.test.ts` run against `prisma/test.db`.** That is intended — it becomes a real end-to-end DB test. The globalSetup guarantees the schema exists.
- **Security boundary (unchanged + extended):**
  - `GET /api/exam/[id]/questions` must **never** include `isCorrect`/`explanation`/`reference` (Plan 1/2 guarantee — do not touch `toPublicQuestion`).
  - The **new** review endpoint/page may include `isCorrect`/`explanation`/`reference`, but **only after the session is submitted**. `getReview` returns `null` for an un-submitted or missing session.
- **TDD:** logic tasks (2, 7, 8) and the persistence/register tasks (1 smoke, 4) write the failing test first. UI tasks (5, 9) and wiring (3, 6) verify via `pnpm test` + `pnpm typecheck` + `pnpm build`.
- **Definition of done per task:** `pnpm test` green, `pnpm typecheck` clean, one commit. Tasks 5 and 9 additionally require `pnpm build` to succeed.

---

## File Structure (what each new/changed file owns)

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | SQLite datasource + `User` and `ExamSession` models. |
| `.env`, `.env.example` | `DATABASE_URL`, `AUTH_SECRET`. `.env` gitignored; `.env.example` committed. |
| `src/lib/db.ts` | `globalThis`-cached `PrismaClient` singleton. |
| `vitest.config.ts`, `vitest.globalSetup.ts` | Point Vitest at `test.db`, push schema before the suite. |
| `src/lib/db.test.ts` | Smoke test: client connects + round-trips a row. |
| `src/lib/exam/store.ts` | Add optional `userId` to the `ExamSession` domain type. |
| `src/lib/exam/prismaStore.ts` | `PrismaSessionStore implements SessionStore` (domain ↔ row mapping). |
| `src/lib/exam/prismaStore.test.ts` | Round-trip + cross-instance persistence tests. |
| `src/lib/exam/service.ts` | `createMock` gains `userId?`; new `getReview()`. |
| `src/lib/exam/instance.ts` | Swap `InMemorySessionStore` → `PrismaSessionStore`. |
| `auth.ts` (repo root) | Auth.js v5 config: Credentials provider, JWT, id callbacks. |
| `types/next-auth.d.ts` | Augment `session.user.id` / JWT `id`. |
| `src/lib/auth/password.ts` | bcrypt hash/verify wrappers. |
| `app/api/auth/[...nextauth]/route.ts` | Mount Auth.js handlers. |
| `app/api/auth/register/route.ts` | Create account (hashed password). |
| `app/api/auth/register/route.test.ts` | Register success / duplicate / invalid. |
| `app/[locale]/signin/page.tsx`, `app/[locale]/register/page.tsx` | Auth UI (client). |
| `src/components/auth/SignOutButton.tsx` | Client sign-out button. |
| `src/components/layout/HudHeader.tsx` | Show account + sign-out, or sign-in link. |
| `app/[locale]/layout.tsx` | Read `auth()`, pass `user` to header. |
| `app/api/exam/route.ts` | Read current user id, pass to `createMock`. |
| `src/lib/exam/history.ts` | `listUserExamHistory(userId)` via Prisma. |
| `src/lib/exam/history.test.ts` | History query: ordering + user isolation. |
| `src/components/dashboard/ExamHistory.tsx` | Render history (or sign-in nudge). |
| `app/[locale]/page.tsx` | Read `auth()`, render history. |
| `src/lib/exam/review.ts` | `ReviewItem` type + pure `buildReview()`. |
| `src/lib/exam/review.test.ts` | Review projection correctness. |
| `app/api/exam/[id]/review/route.ts` | `GET` → review items (post-submission). |
| `app/[locale]/exam/[id]/review/page.tsx` | Review UI (server). |
| `app/[locale]/exam/[id]/results/page.tsx` | Point "Review Answers" at `/review`. |
| `messages/en.json`, `messages/fr.json` | `auth`, `review`, `dashboard.history` keys. |
| `app/globals.css` | Auth-form, history, and review styles. |
| `.gitignore` | Ignore `prisma/*.db*`, `.env`. |

---

## Task 1: Prisma + SQLite scaffold (datasource, client singleton, test DB)

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`, `src/lib/db.test.ts`, `.env`, `.env.example`, `vitest.globalSetup.ts`
- Modify: `package.json`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Install Prisma**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm add -D prisma && pnpm add @prisma/client
```

- [ ] **Step 2: Write the schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id             String        @id @default(cuid())
  email          String        @unique
  name           String?
  hashedPassword String
  createdAt      DateTime      @default(now())
  examSessions   ExamSession[]
}

model ExamSession {
  id          String   @id
  userId      String?
  user        User?    @relation(fields: [userId], references: [id])
  certLevel   String
  locale      String
  questionIds String   // JSON: string[]
  answers     String   @default("{}") // JSON: Record<string, string[]>
  startedAt   DateTime
  expiresAt   DateTime
  submitted   Boolean  @default(false)
  result      String?  // JSON: ExamResult
  createdAt   DateTime @default(now())

  @@index([userId])
}
```

- [ ] **Step 3: Create env files**

Create `.env`:

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="dev-secret-change-me-0000000000000000000000"
```

Create `.env.example`:

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="generate-with: openssl rand -base64 32"
```

- [ ] **Step 4: Update `.gitignore`**

Append to `.gitignore`:

```
# Prisma local databases + secrets
prisma/*.db
prisma/*.db-journal
.env
```

- [ ] **Step 5: Prisma client singleton**

Create `src/lib/db.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

// Cache the client on globalThis so Next.js dev HMR and shared RSC/route-handler
// module instances don't open a new connection pool on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 6: Add scripts**

In `package.json`, add to `scripts` (keep existing entries):

```json
"db:generate": "prisma generate",
"db:push": "prisma db push",
"postinstall": "prisma generate"
```

- [ ] **Step 7: Generate client + create dev DB**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm exec prisma generate && pnpm exec prisma db push
```

Expected: "Your database is now in sync with your Prisma schema." and a generated client.

- [ ] **Step 8: Wire Vitest to a test database**

Create `vitest.globalSetup.ts`:

```typescript
import { execSync } from "node:child_process";

// Build (or reset) the SQLite schema in the test database once, before the suite.
// DATABASE_URL is passed explicitly so the Prisma CLI's dotenv does not override it.
export default function setup(): void {
  execSync("pnpm exec prisma db push --force-reset --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
```

Replace `vitest.config.ts` with:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
    },
    globalSetup: ["./vitest.globalSetup.ts"],
    // All test files share one SQLite file; run them sequentially so concurrent
    // writers don't hit SQLITE_BUSY locks. The suite is small and fast.
    fileParallelism: false,
  },
});
```

- [ ] **Step 9: Write the smoke test**

Create `src/lib/db.test.ts`:

```typescript
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./db";

describe("prisma client", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects and round-trips a User row", async () => {
    const email = `smoke-${Date.now()}@test.local`;
    const created = await prisma.user.create({
      data: { email, hashedPassword: "x" },
    });
    expect(created.id).toBeTruthy();

    const found = await prisma.user.findUnique({ where: { email } });
    expect(found?.email).toBe(email);

    await prisma.user.delete({ where: { id: created.id } });
  });
});
```

- [ ] **Step 10: Run tests (expect all green, including the new smoke test)**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test
```

Expected: previous tests still pass + `prisma client > connects and round-trips a User row` passes. (globalSetup prints the `prisma db push` output once.)

- [ ] **Step 11: Commit**

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(db): add Prisma + SQLite scaffold and test database wiring"
```

---

## Task 2: PrismaSessionStore (domain ↔ row mapping)

**Files:**
- Modify: `src/lib/exam/store.ts`
- Create: `src/lib/exam/prismaStore.ts`, `src/lib/exam/prismaStore.test.ts`

- [ ] **Step 1: Add `userId` to the domain session type**

In `src/lib/exam/store.ts`, add the `userId` field to the `ExamSession` interface (everything else stays):

```typescript
export interface ExamSession {
  id: string;
  userId?: string | null;
  certLevel: ExamCertLevel;
  locale: Locale;
  questionIds: string[];
  startedAt: number;
  expiresAt: number;
  answers: Record<string, string[]>;
  submitted: boolean;
  result?: ExamResult;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/exam/prismaStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../db";
import { PrismaSessionStore } from "./prismaStore";
import type { ExamSession } from "./store";

function sampleSession(id: string): ExamSession {
  return {
    id,
    userId: null,
    certLevel: "BASIC",
    locale: "EN",
    questionIds: ["air-law-0001", "navigation-0002"],
    startedAt: 1_000,
    expiresAt: 1_000 + 90 * 60_000,
    answers: {},
    submitted: false,
  };
}

describe("PrismaSessionStore", () => {
  beforeEach(async () => {
    await prisma.examSession.deleteMany();
  });

  afterAll(async () => {
    await prisma.examSession.deleteMany();
    await prisma.$disconnect();
  });

  it("creates and reads back a session unchanged", async () => {
    const store = new PrismaSessionStore();
    const s = sampleSession("sess-1");
    await store.create(s);
    const got = await store.get("sess-1");
    expect(got).toEqual(s);
  });

  it("returns null for an unknown session", async () => {
    const store = new PrismaSessionStore();
    expect(await store.get("nope")).toBeNull();
  });

  it("persists answers and result on update", async () => {
    const store = new PrismaSessionStore();
    const s = sampleSession("sess-2");
    await store.create(s);
    s.answers["air-law-0001"] = ["a", "c"];
    s.submitted = true;
    s.result = {
      total: 2,
      correct: 1,
      scorePct: 0.5,
      passed: false,
      bySubject: [{ moduleId: "air-law", correct: 1, total: 1 }],
    };
    await store.update(s);
    const got = await store.get("sess-2");
    expect(got).toEqual(s);
  });

  it("is durable across store instances (real persistence)", async () => {
    await new PrismaSessionStore().create(sampleSession("sess-3"));
    const got = await new PrismaSessionStore().get("sess-3");
    expect(got?.id).toBe("sess-3");
    expect(got?.questionIds).toEqual(["air-law-0001", "navigation-0002"]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/exam/prismaStore.test.ts
```

Expected: FAIL — `PrismaSessionStore` not found.

- [ ] **Step 4: Implement the store**

Create `src/lib/exam/prismaStore.ts`:

```typescript
import { prisma } from "../db";
import type { ExamCertLevel, Locale } from "../content/types";
import type { ExamResult } from "./score";
import type { ExamSession, SessionStore } from "./store";

type Row = {
  id: string;
  userId: string | null;
  certLevel: string;
  locale: string;
  questionIds: string;
  answers: string;
  startedAt: Date;
  expiresAt: Date;
  submitted: boolean;
  result: string | null;
};

function toRow(s: ExamSession) {
  return {
    id: s.id,
    userId: s.userId ?? null,
    certLevel: s.certLevel,
    locale: s.locale,
    questionIds: JSON.stringify(s.questionIds),
    answers: JSON.stringify(s.answers),
    startedAt: new Date(s.startedAt),
    expiresAt: new Date(s.expiresAt),
    submitted: s.submitted,
    result: s.result ? JSON.stringify(s.result) : null,
  };
}

function fromRow(r: Row): ExamSession {
  return {
    id: r.id,
    userId: r.userId,
    certLevel: r.certLevel as ExamCertLevel,
    locale: r.locale as Locale,
    questionIds: JSON.parse(r.questionIds) as string[],
    answers: JSON.parse(r.answers) as Record<string, string[]>,
    startedAt: r.startedAt.getTime(),
    expiresAt: r.expiresAt.getTime(),
    submitted: r.submitted,
    result: r.result ? (JSON.parse(r.result) as ExamResult) : undefined,
  };
}

/** SQLite/Prisma-backed session store. Survives server restarts (Plan 3). */
export class PrismaSessionStore implements SessionStore {
  async create(session: ExamSession): Promise<void> {
    await prisma.examSession.create({ data: toRow(session) });
  }

  async get(id: string): Promise<ExamSession | null> {
    const row = await prisma.examSession.findUnique({ where: { id } });
    return row ? fromRow(row as Row) : null;
  }

  async update(session: ExamSession): Promise<void> {
    const { id, ...data } = toRow(session);
    await prisma.examSession.update({ where: { id }, data });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/exam/prismaStore.test.ts
```

Expected: 4 passing.

- [ ] **Step 6: Run the full suite + typecheck**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test && pnpm typecheck
```

Expected: all green, clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(exam): add PrismaSessionStore with domain<->row mapping"
```

---

## Task 3: Wire Prisma store into the app + `userId` on `createMock`

**Files:**
- Modify: `src/lib/exam/service.ts`, `src/lib/exam/service.test.ts`, `src/lib/exam/instance.ts`

- [ ] **Step 1: Write the failing test (userId is stored)**

In `src/lib/exam/service.test.ts`, add this test inside the `describe("ExamService", ...)` block:

```typescript
  it("createMock stores the userId on the session", async () => {
    const store = new InMemorySessionStore();
    const svc = new ExamService(store, () => 1_000, bank);
    const { sessionId } = await svc.createMock("BASIC", "EN", 42, "user-123");
    const session = await store.get(sessionId);
    expect(session?.userId).toBe("user-123");
  });

  it("createMock defaults userId to null when omitted", async () => {
    const store = new InMemorySessionStore();
    const svc = new ExamService(store, () => 1_000, bank);
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    const session = await store.get(sessionId);
    expect(session?.userId).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/exam/service.test.ts
```

Expected: FAIL — `createMock` takes 3 args / `userId` undefined.

- [ ] **Step 3: Add the `userId` parameter**

In `src/lib/exam/service.ts`, change the `createMock` signature and session construction:

```typescript
  async createMock(
    certLevel: ExamCertLevel,
    locale: Locale,
    seed: number = Math.floor(Math.random() * 1e9),
    userId: string | null = null,
  ): Promise<CreatedExam> {
    const spec = EXAM_SPECS[certLevel];
    const questions = generateExam(certLevel, spec.totalQuestions, mulberry32(seed), this.bank);
    const startedAt = this.now();
    const session: ExamSession = {
      id: randomUUID(),
      userId,
      certLevel,
      locale,
      questionIds: questions.map((q) => q.id),
      startedAt,
      expiresAt: startedAt + spec.timeLimitMinutes * 60_000,
      answers: {},
      submitted: false,
    };
    await this.store.create(session);
    return { sessionId: session.id, expiresAt: session.expiresAt, total: questions.length };
  }
```

- [ ] **Step 4: Run the service test to verify it passes**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/exam/service.test.ts
```

Expected: all ExamService tests pass (including the two new ones).

- [ ] **Step 5: Swap the singleton store to Prisma**

Replace `src/lib/exam/instance.ts` with:

```typescript
import { ExamService } from "./service";
import { PrismaSessionStore } from "./prismaStore";

// Single in-process service instance, cached on globalThis so Server Components,
// Route Handlers, and HMR reloads share ONE service. The store is now SQLite-backed
// (PrismaSessionStore), so sessions survive a server restart.
const globalForExam = globalThis as unknown as { examService?: ExamService };

export const examService =
  globalForExam.examService ?? new ExamService(new PrismaSessionStore());

if (!globalForExam.examService) globalForExam.examService = examService;
```

- [ ] **Step 6: Run the full suite (route tests now exercise the real DB)**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test && pnpm typecheck
```

Expected: all green. `app/api/exam/routes.test.ts` now reads/writes `prisma/test.db` (created by globalSetup) and still passes its create → questions → answer → submit flow.

- [ ] **Step 7: Commit**

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(exam): persist sessions via PrismaSessionStore; createMock accepts userId"
```

---

## Task 4: Auth.js scaffold + registration endpoint

**Files:**
- Create: `auth.ts` (repo root), `types/next-auth.d.ts`, `src/lib/auth/password.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/auth/register/route.ts`, `app/api/auth/register/route.test.ts`
- Modify: `package.json`, `tsconfig.json`

- [ ] **Step 1: Install auth deps**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm add next-auth@beta bcryptjs && pnpm add -D @types/bcryptjs
```

- [ ] **Step 2: Password helpers**

Create `src/lib/auth/password.ts`:

```typescript
import bcrypt from "bcryptjs";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 3: Auth.js config**

Create `auth.ts` at the repo root (relative imports — this file is in the Vitest graph via the exam route's dynamic import):

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./src/lib/db";
import { verifyPassword } from "./src/lib/auth/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = typeof creds?.email === "string" ? creds.email : "";
        const password = typeof creds?.password === "string" ? creds.password : "";
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await verifyPassword(password, user.hashedPassword);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = (user as { id: string }).id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
```

- [ ] **Step 4: Type augmentation**

Create `types/next-auth.d.ts`:

```typescript
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
```

- [ ] **Step 5: Include new roots in tsconfig**

In `tsconfig.json`, add `"auth.ts"` and `"types"` to the `include` array (keep existing entries):

```json
  "include": [
    "app",
    "auth.ts",
    "content",
    "messages",
    "middleware.ts",
    "next.config.ts",
    "src",
    "tailwind.config.ts",
    "types",
    ".next/types/**/*.ts"
  ],
```

- [ ] **Step 6: Mount Auth.js handlers**

Create `app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "../../../../auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 7: Write the failing register test**

Create `app/api/auth/register/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { POST as register } from "./route";

function req(body: unknown) {
  return new Request("http://test/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });
  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("creates a user with a hashed (not plaintext) password", async () => {
    const res = await register(req({ email: "a@test.local", password: "hunter2pw", name: "Ada" }));
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: "a@test.local" } });
    expect(user).not.toBeNull();
    expect(user!.hashedPassword).not.toBe("hunter2pw");
    expect(user!.name).toBe("Ada");
  });

  it("rejects a duplicate email with 409", async () => {
    await register(req({ email: "dup@test.local", password: "hunter2pw" }));
    const res = await register(req({ email: "dup@test.local", password: "anotherpw" }));
    expect(res.status).toBe(409);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await register(req({ email: "not-an-email", password: "x" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 8: Run to verify it fails**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test app/api/auth/register/route.test.ts
```

Expected: FAIL — `./route` has no `POST`.

- [ ] **Step 9: Implement the register route**

Create `app/api/auth/register/route.ts` (relative imports — this file is in the Vitest graph):

```typescript
import { z } from "zod";
import { prisma } from "../../../../src/lib/db";
import { hashPassword } from "../../../../src/lib/auth/password";

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = RegisterBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "email already registered" }, { status: 409 });
  }

  const hashedPassword = await hashPassword(password);
  await prisma.user.create({ data: { email, name, hashedPassword } });
  return Response.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 10: Run the register test to verify it passes**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test app/api/auth/register/route.test.ts
```

Expected: 3 passing.

- [ ] **Step 11: Full suite + typecheck**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test && pnpm typecheck
```

Expected: all green, clean.

- [ ] **Step 12: Commit**

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(auth): Auth.js v5 credentials config + registration endpoint"
```

---

## Task 5: Auth UI (sign-in, register, header account)

**Files:**
- Create: `app/[locale]/signin/page.tsx`, `app/[locale]/register/page.tsx`, `src/components/auth/SignOutButton.tsx`
- Modify: `src/components/layout/HudHeader.tsx`, `app/[locale]/layout.tsx`, `messages/en.json`, `messages/fr.json`, `app/globals.css`

- [ ] **Step 1: Add `auth` message keys**

In `messages/en.json`, add this top-level block (after `"nav"`):

```json
  "auth": {
    "signIn": "Sign In",
    "register": "Create Account",
    "signOut": "Sign Out",
    "email": "Email",
    "password": "Password",
    "name": "Call Sign (optional)",
    "needAccount": "Need an account? Register",
    "haveAccount": "Have an account? Sign in",
    "guest": "Guest",
    "invalidCredentials": "Invalid email or password.",
    "registerFailed": "Could not create account. The email may already be in use.",
    "working": "Working…"
  },
```

In `messages/fr.json`, add the matching block:

```json
  "auth": {
    "signIn": "Se connecter",
    "register": "Créer un compte",
    "signOut": "Se déconnecter",
    "email": "Courriel",
    "password": "Mot de passe",
    "name": "Indicatif (facultatif)",
    "needAccount": "Besoin d'un compte ? S'inscrire",
    "haveAccount": "Vous avez un compte ? Se connecter",
    "guest": "Invité",
    "invalidCredentials": "Courriel ou mot de passe invalide.",
    "registerFailed": "Impossible de créer le compte. Le courriel est peut-être déjà utilisé.",
    "working": "En cours…"
  },
```

- [ ] **Step 2: Sign-out button**

Create `src/components/auth/SignOutButton.tsx`:

```tsx
'use client';

import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

export default function SignOutButton({ locale }: { locale: string }) {
  const t = useTranslations('auth');
  return (
    <button
      type="button"
      className="locale-btn"
      onClick={() => signOut({ callbackUrl: `/${locale}` })}
    >
      {t('signOut')}
    </button>
  );
}
```

- [ ] **Step 3: Sign-in page**

Create `app/[locale]/signin/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';

export default function SignInPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn('credentials', { email, password, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError(t('invalidCredentials'));
      return;
    }
    router.push(`/${locale}`);
    router.refresh();
  }

  return (
    <div className="auth-view">
      <form className="hud-panel auth-card" onSubmit={onSubmit}>
        <div className="auth-title">// {t('signIn')}</div>
        <label className="auth-label">{t('email')}
          <input className="auth-input" type="email" value={email} required
            onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="auth-label">{t('password')}
          <input className="auth-input" type="password" value={password} required
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn-launch" type="submit" disabled={busy}>
          ▶ {busy ? t('working') : t('signIn')}
        </button>
        <Link href={`/${locale}/register`} className="auth-link">{t('needAccount')}</Link>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Register page**

Create `app/[locale]/register/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: name || undefined }),
    });
    if (!res.ok) {
      setBusy(false);
      setError(t('registerFailed'));
      return;
    }
    // Auto sign-in after successful registration.
    await signIn('credentials', { email, password, redirect: false });
    setBusy(false);
    router.push(`/${locale}`);
    router.refresh();
  }

  return (
    <div className="auth-view">
      <form className="hud-panel auth-card" onSubmit={onSubmit}>
        <div className="auth-title">// {t('register')}</div>
        <label className="auth-label">{t('name')}
          <input className="auth-input" type="text" value={name}
            onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="auth-label">{t('email')}
          <input className="auth-input" type="email" value={email} required
            onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="auth-label">{t('password')}
          <input className="auth-input" type="password" value={password} required minLength={8}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn-launch" type="submit" disabled={busy}>
          ▶ {busy ? t('working') : t('register')}
        </button>
        <Link href={`/${locale}/signin`} className="auth-link">{t('haveAccount')}</Link>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Header shows account + sign-out (or sign-in link)**

In `src/components/layout/HudHeader.tsx`: (a) accept a `user` prop; (b) import the sign-out button; (c) render account state next to the locale switcher. Change the component signature and add the block:

Change the signature line:

```tsx
export default function HudHeader({
  locale,
  user,
}: {
  locale: string;
  user: { name?: string | null; email?: string | null } | null;
}) {
```

Add the import at the top (with the other imports):

```tsx
import SignOutButton from '@/components/auth/SignOutButton';
```

Immediately **before** the `{/* Locale switcher */}` block, insert:

```tsx
      {/* Account */}
      <div className="account-box">
        {user ? (
          <>
            <span className="account-name">{user.name || user.email}</span>
            <SignOutButton locale={locale} />
          </>
        ) : (
          <Link href={`/${locale}/signin`} className="locale-btn">
            {t('signIn')}
          </Link>
        )}
      </div>
```

The header already calls `useTranslations('nav')`; add a second hook near it for the auth namespace. Replace the existing `const t = useTranslations('nav');` line with:

```tsx
  const t = useTranslations('nav');
  const tAuth = useTranslations('auth');
```

…and in the Account block use `tAuth('signIn')` instead of `t('signIn')`:

```tsx
          <Link href={`/${locale}/signin`} className="locale-btn">
            {tAuth('signIn')}
          </Link>
```

- [ ] **Step 6: Layout reads the session and passes `user`**

In `app/[locale]/layout.tsx`, import `auth` and pass the user. Add the import:

```tsx
import { auth } from '../../auth';
```

Inside the component, after computing `messages`, fetch the session and pass it down:

```tsx
  const messages = await getMessages();
  const session = await auth();
  const user = session?.user ? { name: session.user.name, email: session.user.email } : null;
```

Update the header usage:

```tsx
        <HudHeader locale={locale} user={user} />
```

- [ ] **Step 7: Auth styles**

Append to `app/globals.css`:

```css
/* ---- Auth ---- */
.auth-view {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 48px 24px;
}
.auth-card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px;
}
.auth-title {
  font-family: var(--font-mono);
  color: var(--cyan);
  font-size: 13px;
  letter-spacing: 0.12em;
  margin-bottom: 4px;
}
.auth-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--font-ui);
  font-size: 12px;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
}
.auth-input {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(0, 212, 255, 0.25);
  border-radius: 4px;
  padding: 10px 12px;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 14px;
  outline: none;
}
.auth-input:focus {
  border-color: var(--cyan);
  box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.15);
}
.auth-error {
  color: var(--red);
  font-family: var(--font-mono);
  font-size: 12px;
}
.auth-link {
  font-family: var(--font-mono);
  font-size: 12px;
  color: rgba(0, 212, 255, 0.8);
  text-align: center;
  text-decoration: none;
}
.auth-link:hover { color: var(--cyan); }
.account-box {
  display: flex;
  align-items: center;
  gap: 8px;
}
.account-name {
  font-family: var(--font-mono);
  font-size: 11px;
  color: rgba(0, 255, 136, 0.85);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 8: Typecheck, build, and test**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm typecheck && pnpm test && pnpm build
```

Expected: clean typecheck, all tests pass, build succeeds (new `/[locale]/signin` and `/[locale]/register` routes listed).

- [ ] **Step 9: Commit**

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(auth): sign-in/register pages + header account state"
```

---

## Task 6: Tag exam sessions with the signed-in user + dashboard history

**Files:**
- Modify: `app/api/exam/route.ts`, `app/[locale]/page.tsx`, `messages/en.json`, `messages/fr.json`, `app/globals.css`
- Create: `src/lib/exam/history.ts`, `src/lib/exam/history.test.ts`, `src/components/dashboard/ExamHistory.tsx`

- [ ] **Step 1: Write the failing history test**

Create `src/lib/exam/history.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../db";
import { listUserExamHistory } from "./history";

async function seedSession(id: string, userId: string | null, startedAt: number, submitted: boolean) {
  await prisma.examSession.create({
    data: {
      id,
      userId,
      certLevel: "BASIC",
      locale: "EN",
      questionIds: "[]",
      answers: "{}",
      startedAt: new Date(startedAt),
      expiresAt: new Date(startedAt + 1000),
      submitted,
      result: submitted
        ? JSON.stringify({ total: 35, correct: 30, scorePct: 30 / 35, passed: true, bySubject: [] })
        : null,
    },
  });
}

describe("listUserExamHistory", () => {
  beforeEach(async () => {
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({ data: { id: "u1", email: "u1@test.local", hashedPassword: "x" } });
    await prisma.user.create({ data: { id: "u2", email: "u2@test.local", hashedPassword: "x" } });
  });
  afterAll(async () => {
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("returns a user's sessions newest-first and excludes other users", async () => {
    await seedSession("a", "u1", 1_000, true);
    await seedSession("b", "u1", 3_000, false);
    await seedSession("c", "u2", 2_000, true);

    const history = await listUserExamHistory("u1");
    expect(history.map((h) => h.id)).toEqual(["b", "a"]);
    expect(history[1].scorePct).toBeCloseTo(30 / 35);
    expect(history[1].passed).toBe(true);
    expect(history[0].scorePct).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/exam/history.test.ts
```

Expected: FAIL — `listUserExamHistory` not found.

- [ ] **Step 3: Implement the history query**

Create `src/lib/exam/history.ts` (relative imports):

```typescript
import { prisma } from "../db";
import type { ExamResult } from "./score";

export interface ExamHistoryItem {
  id: string;
  certLevel: string;
  submitted: boolean;
  scorePct: number | null;
  passed: boolean | null;
  startedAt: number;
}

export async function listUserExamHistory(userId: string, limit = 10): Promise<ExamHistoryItem[]> {
  const rows = await prisma.examSession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => {
    const result = r.result ? (JSON.parse(r.result) as ExamResult) : null;
    return {
      id: r.id,
      certLevel: r.certLevel,
      submitted: r.submitted,
      scorePct: result?.scorePct ?? null,
      passed: result?.passed ?? null,
      startedAt: r.startedAt.getTime(),
    };
  });
}
```

- [ ] **Step 4: Run the history test to verify it passes**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/exam/history.test.ts
```

Expected: 1 passing.

- [ ] **Step 5: Read the current user when creating an exam**

Replace `app/api/exam/route.ts` with (adds a context-tolerant user lookup that defaults to `null` in tests / for guests):

```typescript
import { z } from "zod";
import { examService } from "../../../src/lib/exam/instance";

const CreateBody = z.object({
  certLevel: z.enum(["BASIC", "ADVANCED"]),
  locale: z.enum(["EN", "FR"]),
  seed: z.number().int().optional(),
});

// Resolve the signed-in user id without breaking when there is no request
// context (unit tests) or the user is a guest. Auth is additive, never gating.
async function currentUserId(): Promise<string | null> {
  try {
    const { auth } = await import("../../../auth");
    const session = await auth();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { certLevel, locale, seed } = parsed.data;
  const userId = await currentUserId();
  const created = await examService.createMock(certLevel, locale, seed, userId);
  return Response.json(created, { status: 201 });
}
```

- [ ] **Step 6: Dashboard history message keys**

In `messages/en.json`, add to the `"dashboard"` object:

```json
    "history": "Mission Log",
    "noHistory": "No exams yet. Launch your first mock.",
    "signInToSave": "Sign in to save your exam history.",
    "viewResult": "View"
```

In `messages/fr.json`, add to the `"dashboard"` object:

```json
    "history": "Journal de mission",
    "noHistory": "Aucun examen pour l'instant. Lancez votre premier examen simulé.",
    "signInToSave": "Connectez-vous pour enregistrer votre historique d'examens.",
    "viewResult": "Voir"
```

- [ ] **Step 7: Exam-history component**

Create `src/components/dashboard/ExamHistory.tsx`:

```tsx
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { listUserExamHistory } from '@/lib/exam/history';

export default async function ExamHistory({ userId, locale }: { userId: string; locale: string }) {
  const t = await getTranslations({ locale });
  const items = await listUserExamHistory(userId);

  return (
    <div className="hud-panel history-card">
      <div className="breakdown-title">// {t('dashboard.history')}</div>
      {items.length === 0 ? (
        <div className="history-empty">{t('dashboard.noHistory')}</div>
      ) : (
        <ul className="history-list">
          {items.map((it) => {
            const date = new Date(it.startedAt).toISOString().split('T')[0];
            const pct = it.scorePct === null ? null : Math.round(it.scorePct * 100);
            return (
              <li key={it.id} className="history-row">
                <span className="history-date">{date}</span>
                <span className="history-cert">{t(`certLevel.${it.certLevel}`)}</span>
                <span className={`history-score${it.passed ? ' pass' : it.submitted ? ' fail' : ''}`}>
                  {pct === null ? '—' : `${pct}%`}
                </span>
                {it.submitted && (
                  <Link href={`/${locale}/exam/${it.id}/results`} className="history-link">
                    {t('dashboard.viewResult')}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Render history on the dashboard**

In `app/[locale]/page.tsx`: import `auth` and the component, read the session, and render history in the bottom panel. Add imports:

```tsx
import { auth } from '../../auth';
import ExamHistory from '@/components/dashboard/ExamHistory';
```

Inside the component, after `const t = await getTranslations();`, add:

```tsx
  const session = await auth();
  const userId = session?.user?.id ?? null;
```

Then, inside the `<div className="bottom-panel">`, after the `overall-card` panel and before closing the `bottom-panel` div, add:

```tsx
          {userId ? (
            <ExamHistory userId={userId} locale={locale} />
          ) : (
            <div className="hud-panel history-card">
              <div className="breakdown-title">// {t('dashboard.history')}</div>
              <div className="history-empty">{t('dashboard.signInToSave')}</div>
            </div>
          )}
```

- [ ] **Step 9: History styles**

Append to `app/globals.css`:

```css
/* ---- Mission log ---- */
.history-card { padding: 20px; min-width: 280px; }
.history-empty {
  font-family: var(--font-mono);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 10px;
}
.history-list { list-style: none; margin: 10px 0 0; padding: 0; }
.history-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 212, 255, 0.08);
  font-family: var(--font-mono);
  font-size: 12px;
}
.history-date { color: rgba(255, 255, 255, 0.55); }
.history-cert { color: rgba(255, 255, 255, 0.8); }
.history-score { color: rgba(255, 255, 255, 0.5); font-weight: 700; }
.history-score.pass { color: var(--green); }
.history-score.fail { color: var(--red); }
.history-link { color: rgba(0, 212, 255, 0.85); text-decoration: none; }
.history-link:hover { color: var(--cyan); }
```

- [ ] **Step 10: Typecheck, test, build**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm typecheck && pnpm test && pnpm build
```

Expected: clean, all tests pass (`routes.test.ts` still passes — `currentUserId()` returns `null` with no request context), build succeeds.

- [ ] **Step 11: Commit**

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(dashboard): attach exam sessions to users + mission-log history"
```

---

## Task 7: Review projection (pure builder)

**Files:**
- Create: `src/lib/exam/review.ts`, `src/lib/exam/review.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/exam/review.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildReview } from "./review";
import type { Question } from "../content/types";

const q: Question = {
  id: "air-law-0001",
  moduleId: "air-law",
  certLevel: "BASIC",
  type: "SINGLE",
  selectCount: 1,
  difficulty: 1,
  stem: { EN: "EN stem", FR: "FR stem" },
  options: [
    { id: "a", label: { EN: "EN A", FR: "FR A" }, isCorrect: false },
    { id: "b", label: { EN: "EN B", FR: "FR B" }, isCorrect: true },
  ],
  explanation: { EN: "EN expl", FR: "FR expl" },
  reference: { EN: "CAR 901", FR: "RAC 901" },
  tags: [],
};

describe("buildReview", () => {
  it("projects a question with the user's selection and correctness (EN)", () => {
    const [item] = buildReview([q], { "air-law-0001": ["a"] }, "EN");
    expect(item.stem).toBe("EN stem");
    expect(item.options).toEqual([
      { id: "a", label: "EN A", isCorrect: false },
      { id: "b", label: "EN B", isCorrect: true },
    ]);
    expect(item.selectedOptionIds).toEqual(["a"]);
    expect(item.correctOptionIds).toEqual(["b"]);
    expect(item.isCorrect).toBe(false);
    expect(item.explanation).toBe("EN expl");
    expect(item.reference).toBe("CAR 901");
  });

  it("marks a correct answer and projects FR strings", () => {
    const [item] = buildReview([q], { "air-law-0001": ["b"] }, "FR");
    expect(item.isCorrect).toBe(true);
    expect(item.stem).toBe("FR stem");
    expect(item.reference).toBe("RAC 901");
  });

  it("treats a missing answer as not-correct with empty selection", () => {
    const [item] = buildReview([q], {}, "EN");
    expect(item.selectedOptionIds).toEqual([]);
    expect(item.isCorrect).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/exam/review.test.ts
```

Expected: FAIL — `buildReview` not found.

- [ ] **Step 3: Implement the builder**

Create `src/lib/exam/review.ts`:

```typescript
import type { Locale, Question } from "../content/types";
import { correctOptionIds, isAnswerCorrect } from "./grade";

export interface ReviewOption {
  id: string;
  label: string;
  isCorrect: boolean;
}

export interface ReviewItem {
  id: string;
  moduleId: string;
  stem: string;
  options: ReviewOption[];
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean;
  explanation: string;
  reference: string;
}

/**
 * Post-submission projection: each question with the user's selection, the
 * correct option(s), explanation and reference, localized. Server-only — this
 * intentionally includes isCorrect/explanation and must never be used pre-submit.
 */
export function buildReview(
  questions: Question[],
  answers: Record<string, string[]>,
  locale: Locale,
): ReviewItem[] {
  return questions.map((q) => {
    const selected = answers[q.id] ?? [];
    return {
      id: q.id,
      moduleId: q.moduleId,
      stem: q.stem[locale],
      options: q.options.map((o) => ({ id: o.id, label: o.label[locale], isCorrect: o.isCorrect })),
      selectedOptionIds: selected,
      correctOptionIds: correctOptionIds(q),
      isCorrect: isAnswerCorrect(q, selected),
      explanation: q.explanation[locale],
      reference: q.reference[locale],
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/exam/review.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(exam): pure buildReview projection for post-submission review"
```

---

## Task 8: `getReview` service method + review endpoint

**Files:**
- Modify: `src/lib/exam/service.ts`, `src/lib/exam/service.test.ts`
- Create: `app/api/exam/[id]/review/route.ts`

- [ ] **Step 1: Write the failing service tests**

In `src/lib/exam/service.test.ts`, add the `buildReview` type import at the top is not needed; just add these tests inside `describe("ExamService", ...)`:

```typescript
  it("getReview() is null before submit", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    expect(await svc.getReview(sessionId)).toBeNull();
  });

  it("getReview() returns one item per question after submit", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    await svc.submit(sessionId);
    const review = await svc.getReview(sessionId);
    expect(review).not.toBeNull();
    expect(review!.length).toBe(35);
    expect(review![0]).toHaveProperty("correctOptionIds");
    expect(review![0]).toHaveProperty("explanation");
  });

  it("getReview() is null for an unknown session", async () => {
    const svc = newService();
    expect(await svc.getReview("missing")).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/exam/service.test.ts
```

Expected: FAIL — `svc.getReview` is not a function.

- [ ] **Step 3: Add `getReview` to the service**

In `src/lib/exam/service.ts`, add the import near the top (with the other `./` imports):

```typescript
import { buildReview, type ReviewItem } from "./review";
```

Add this method to the `ExamService` class (e.g. after `getResult`):

```typescript
  /** Post-submission review (null if missing or not yet submitted). Server-only. */
  async getReview(sessionId: string): Promise<ReviewItem[] | null> {
    const session = await this.store.get(sessionId);
    if (!session || !session.submitted) return null;
    const questions = session.questionIds
      .map((id) => this.byId(id))
      .filter((q): q is Question => Boolean(q));
    return buildReview(questions, session.answers, session.locale);
  }
```

- [ ] **Step 4: Run the service test to verify it passes**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/exam/service.test.ts
```

Expected: all ExamService tests pass.

- [ ] **Step 5: Create the review endpoint**

Create `app/api/exam/[id]/review/route.ts`:

```typescript
import { examService } from "../../../../../src/lib/exam/instance";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const review = await examService.getReview(id);
  if (review === null) {
    return Response.json({ error: "not submitted or session not found" }, { status: 404 });
  }
  return Response.json(review, { status: 200 });
}
```

- [ ] **Step 6: Add a route-level test for review**

In `app/api/exam/routes.test.ts`, add the import at the top (with the other route imports):

```typescript
import { GET as getReview } from "./[id]/review/route";
```

Add this test inside the `describe(...)`:

```typescript
  it("review is 404 before submit and 200 after submit", async () => {
    const createRes = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        body: JSON.stringify({ certLevel: "BASIC", locale: "EN", seed: 11 }),
      }),
    );
    const { sessionId } = (await createRes.json()) as { sessionId: string };

    const before = await getReview(new Request("http://test"), {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(before.status).toBe(404);

    await postSubmit(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: sessionId }),
    });

    const after = await getReview(new Request("http://test"), {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(after.status).toBe(200);
    const items = (await after.json()) as unknown[];
    expect(items.length).toBe(35);
  });
```

- [ ] **Step 7: Full suite + typecheck**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test && pnpm typecheck
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(exam): getReview service method + GET /api/exam/[id]/review"
```

---

## Task 9: Review page UI + wire the "Review Answers" button

**Files:**
- Create: `app/[locale]/exam/[id]/review/page.tsx`
- Modify: `app/[locale]/exam/[id]/results/page.tsx`, `messages/en.json`, `messages/fr.json`, `app/globals.css`

- [ ] **Step 1: Add `review` message keys**

In `messages/en.json`, add this top-level block (after `"results"`):

```json
  "review": {
    "title": "Answer Review",
    "yourAnswer": "Your answer",
    "correctAnswer": "Correct answer",
    "explanation": "Explanation",
    "reference": "Reference",
    "correct": "CORRECT",
    "incorrect": "INCORRECT",
    "notAnswered": "(not answered)",
    "backToResults": "Back to Results"
  }
```

In `messages/fr.json`, add the matching block (after `"results"`):

```json
  "review": {
    "title": "Révision des réponses",
    "yourAnswer": "Votre réponse",
    "correctAnswer": "Bonne réponse",
    "explanation": "Explication",
    "reference": "Référence",
    "correct": "CORRECT",
    "incorrect": "INCORRECT",
    "notAnswered": "(sans réponse)",
    "backToResults": "Retour aux résultats"
  }
```

- [ ] **Step 2: Build the review page**

Create `app/[locale]/exam/[id]/review/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { examService } from '@/lib/exam/instance';

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function ReviewPage({ params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale });

  const review = await examService.getReview(id);
  if (!review) notFound();

  const labelFor = (item: (typeof review)[number], ids: string[]) =>
    ids.length === 0
      ? t('review.notAnswered')
      : item.options
          .filter((o) => ids.includes(o.id))
          .map((o) => o.label)
          .join(', ');

  return (
    <div className="review-view">
      <div className="review-head">
        <div className="review-title">// {t('review.title')}</div>
        <Link href={`/${locale}/exam/${id}/results`} className="btn-review">
          ↩ {t('review.backToResults')}
        </Link>
      </div>

      <div className="review-list">
        {review.map((item, i) => (
          <div key={item.id} className={`hud-panel review-card${item.isCorrect ? ' ok' : ' bad'}`}>
            <div className="review-card-head">
              <span className="review-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="review-module">{t(`modules.${item.moduleId}`)}</span>
              <span className={`review-flag${item.isCorrect ? ' ok' : ' bad'}`}>
                {item.isCorrect ? t('review.correct') : t('review.incorrect')}
              </span>
            </div>
            <div className="review-stem">{item.stem}</div>
            <ul className="review-options">
              {item.options.map((o) => {
                const chosen = item.selectedOptionIds.includes(o.id);
                const cls = o.isCorrect ? 'opt correct' : chosen ? 'opt chosen-wrong' : 'opt';
                return (
                  <li key={o.id} className={cls}>
                    <span className="opt-mark">{o.isCorrect ? '✓' : chosen ? '✕' : '·'}</span>
                    {o.label}
                  </li>
                );
              })}
            </ul>
            <div className="review-meta">
              <span className="review-meta-label">{t('review.yourAnswer')}:</span>{' '}
              <span className={item.isCorrect ? 'ok' : 'bad'}>
                {labelFor(item, item.selectedOptionIds)}
              </span>
            </div>
            <div className="review-meta">
              <span className="review-meta-label">{t('review.correctAnswer')}:</span>{' '}
              <span className="ok">{labelFor(item, item.correctOptionIds)}</span>
            </div>
            <div className="review-explanation">
              <span className="review-meta-label">{t('review.explanation')}:</span> {item.explanation}
            </div>
            <div className="review-reference">
              <span className="review-meta-label">{t('review.reference')}:</span> {item.reference}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Point the results "Review Answers" button at the review page**

In `app/[locale]/exam/[id]/results/page.tsx`, change the review link (currently `href={`/${locale}`}`) to:

```tsx
        <Link href={`/${locale}/exam/${id}/review`} className="btn-review">
          ↩ {t('results.reviewAnswers')}
        </Link>
```

- [ ] **Step 4: Review styles**

Append to `app/globals.css`:

```css
/* ---- Answer review ---- */
.review-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  max-width: 880px;
  margin: 0 auto;
}
.review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.review-title {
  font-family: var(--font-display);
  color: var(--cyan);
  font-size: 18px;
  letter-spacing: 0.1em;
}
.review-list { display: flex; flex-direction: column; gap: 14px; }
.review-card { padding: 18px; border-left: 3px solid rgba(255, 255, 255, 0.1); }
.review-card.ok { border-left-color: var(--green); }
.review-card.bad { border-left-color: var(--red); }
.review-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  margin-bottom: 10px;
}
.review-index { color: var(--cyan); }
.review-module { color: rgba(255, 255, 255, 0.6); flex: 1; }
.review-flag { font-weight: 700; letter-spacing: 0.08em; }
.review-flag.ok { color: var(--green); }
.review-flag.bad { color: var(--red); }
.review-stem {
  font-family: var(--font-ui);
  font-size: 15px;
  color: #fff;
  margin-bottom: 12px;
  line-height: 1.5;
}
.review-options { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.review-options .opt {
  font-family: var(--font-mono);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  display: flex;
  gap: 8px;
}
.review-options .opt.correct { color: var(--green); }
.review-options .opt.chosen-wrong { color: var(--red); text-decoration: line-through; }
.opt-mark { width: 14px; display: inline-block; }
.review-meta, .review-explanation, .review-reference {
  font-family: var(--font-mono);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 6px;
  line-height: 1.5;
}
.review-meta-label { color: rgba(0, 212, 255, 0.7); }
.review-meta .ok { color: var(--green); }
.review-meta .bad { color: var(--red); }
```

- [ ] **Step 5: Typecheck, test, build**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm typecheck && pnpm test && pnpm build
```

Expected: clean, all tests pass, build succeeds (new `/[locale]/exam/[id]/review` route listed).

- [ ] **Step 6: Commit**

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(review): post-submission per-question review page + wire results button"
```

---

## Final review (after all 9 tasks)

Dispatch a final whole-implementation code reviewer. Confirm:

1. **Persistence:** create a Basic mock, restart the dev server, GET its results — session survives (was impossible with the in-memory store).
2. **Security:** `GET /api/exam/[id]/questions` body contains **no** `isCorrect`/`explanation`/`reference`; the review endpoint returns them **only after submit** (404 before).
3. **Auth additive:** signed-out users can still create + take an exam; signed-in users see the new session in the Mission Log; sign-out works.
4. **i18n parity:** `messages/en.json` and `messages/fr.json` have identical key trees (new `auth`, `review`, `dashboard.history` blocks present in both); FR review page shows French stems, module names, explanations.
5. **Gates:** `pnpm test` green, `pnpm typecheck` clean, `pnpm build` succeeds.

Then use **superpowers:finishing-a-development-branch**.

---

## Known gaps carried to Plan 4

- **Guest-history claiming not implemented:** guest sessions stay `userId = null`; signing in later does not retro-attach them. (Design §5.3 "claimable account" deferred.)
- **No email magic link / OAuth:** credentials-only for a local project; no email verification or password reset.
- **Question catalog still in JSON**, not the DB — grading and review read `content/question-bank.json` via the in-memory bank. Moving the catalog into Prisma (design §6 `Module`/`Question`/`Option`) is later content-tooling work.
- **Answers stored as a JSON column**, not per-row `ExamAnswer` records (functionally equivalent here because the service rewrites the whole session on each answer; revisit if concurrent per-answer writes are ever needed).
- **Dashboard module progress + recency** remain placeholders (need lesson/LMS models — Plan 4).
