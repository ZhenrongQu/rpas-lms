# Plan 4 — LMS Lessons (MDX) + Progress + Checkpoint Gating

> **Update (2026-06-07):** Bilingual lesson **content** for the Basic & Advanced courses
> is now authored (see `content/lessons/README.md` and
> `docs/superpowers/specs/2026-06-07-basic-advanced-lesson-content-design.md`). When
> implementing this plan, apply that spec's §10 patches: locale **`fr`→`zh`** (the app
> is en/zh, not en/fr), add a **`{course}` path segment** so `lessonId` =
> `{course}/{moduleId}/{slug}`, and add an **`access: FREE|PAID`** frontmatter field +
> a `canViewLesson(tier, access)` gate (mirroring `canCreateExam`). The authored content
> already follows that structure.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Learn" half of the platform — bilingual MDX lessons with a course sidebar (per-lesson completion checkmarks + % bar), inline checkpoint questions that gate progress ("answer correctly to continue"), per-user lesson-progress persistence, and real module progress on the dashboard — proven end-to-end with one fully-authored module (Air Law); the other 7 are scaffolded "coming soon".

**Architecture:** Lessons are **MDX files** under `content/lessons/{en,fr}/{moduleId}/{slug}.mdx` rendered with `next-mdx-remote/rsc` (no `next.config` MDX plugin — we compile MDX strings in Server Components). Lesson *metadata* comes from the file frontmatter via a catalog loader (no `Lesson`/`Module` DB tables — YAGNI). Only **`LessonProgress`** is persisted in Prisma. Checkpoints reuse the Plan 1 grader server-side; a small client React context lets a lesson's "Complete & Continue" button stay disabled until every checkpoint on the page is answered correctly.

**Tech Stack:** Next.js 15 App Router · `next-mdx-remote` + `gray-matter` · Prisma 5/SQLite · next-intl · Vitest. (No deployment in this plan — local only, per the product decision.)

---

## Conventions & Gotchas (read before any task)

- **Repo root:** `/Users/quzhenrong/rpas-lms`. Bash cwd resets to `$HOME` — prefix commands with `cd /Users/quzhenrong/rpas-lms &&`. Use **pnpm** (v10), Node v20.14, Prisma **5.x**.
- **Import-alias rule (unchanged):** Vitest does NOT resolve `@/`. Every file in the test graph — all `src/lib/**`, every `*.test.ts`, and any `app/api/**/route.ts` imported by a route test — MUST use **relative** imports. Only `app/` pages/components and `src/components/**` not imported by a test may use `@/`.
- **Locale casing:** route segments are lowercase `en`/`fr`; the content `Locale` type is uppercase `EN`/`FR`. Lesson **files/dirs use lowercase** (`content/lessons/en/...`). The catalog loader takes the lowercase route locale; map to uppercase only when calling exam-engine helpers (`toPublicQuestion`, etc.).
- **`lessonId` is locale-independent:** `` `${moduleId}/${slug}` `` (e.g. `air-law/registration`). It is what `LessonProgress` stores and what the progress API receives.
- **Module structure is identical across locales.** The EN tree is the canonical structure (used for lesson counts); FR mirrors it by path. Authoring must keep both in sync.
- **Auth is still additive.** Lessons are readable by guests; only *saving progress* requires an account (the Complete button + progress API). Don't gate lesson reading.
- **Security:** the checkpoint "fetch question" endpoint returns the **public** projection (no `isCorrect`); grading stays server-side (reuse `isAnswerCorrect`). Explanations are returned only from the *check* (grade) endpoint, which is fine — checkpoints are formative, but still grade server-side so answers aren't pre-revealed in the page source.
- **TDD** for logic/data/API tasks (2,3,4); UI/content tasks (1,5,6,7,8,9,10) verify with `pnpm typecheck` + `pnpm test` (existing must stay green) + `pnpm build`.
- **Definition of done per task:** `pnpm test` green, `pnpm typecheck` clean, ONE commit on a feature branch. (Start by creating the branch — see Task 0.)

---

## File Structure

| File | Responsibility |
|---|---|
| `content/lessons/{en,fr}/air-law/*.mdx` | Authored bilingual lesson content (frontmatter + MDX body + `<Checkpoint>`). |
| `src/lib/lessons/types.ts` | `LessonMeta` type + frontmatter Zod schema. |
| `src/lib/lessons/catalog.ts` | fs-based loader: `getModuleLessons`, `getLesson`, `getModuleLessonCount`. |
| `src/lib/lessons/catalog.test.ts` | Loader tests against the authored Air Law files. |
| `prisma/schema.prisma` | Add `LessonProgress` model + `User.lessonProgress`. |
| `src/lib/lessons/progress.ts` | `markLessonComplete`, `listCompletedLessonIds` (Prisma). |
| `src/lib/lessons/progress.test.ts` | Progress upsert + per-user isolation tests. |
| `app/api/progress/lesson/route.ts` | `POST` mark a lesson complete (auth required). |
| `app/api/progress/lesson/route.test.ts` | 200 (mocked auth path) / 401 (no auth) — see task. |
| `app/api/checkpoint/[id]/route.ts` | `GET` public checkpoint question. |
| `app/api/checkpoint/check/route.ts` | `POST` grade a checkpoint answer (server-side). |
| `app/api/checkpoint/checkpoint.test.ts` | get (no leak) + check (correct/incorrect) tests. |
| `src/components/learn/mdx/Callout.tsx` | `<Tip>/<Caution>/<Note>` presentational components. |
| `src/components/learn/MDXContent.tsx` | Server component: `MDXRemote` + components map. |
| `src/components/learn/lessonProgressContext.tsx` | Client context: register/pass checkpoints, `allPassed`. |
| `src/components/learn/Checkpoint.tsx` | Client checkpoint island (fetch question → answer → grade → gate). |
| `src/components/learn/CompleteButton.tsx` | Client: enabled when `allPassed`; POSTs progress; goes to next. |
| `src/components/learn/LessonShell.tsx` | Client wrapper: provides context around MDX children + CompleteButton. |
| `src/components/learn/LessonSidebar.tsx` | Server: module lesson list w/ checkmarks + % bar. |
| `app/[locale]/learn/[moduleId]/page.tsx` | Module landing: lesson list or "coming soon". |
| `app/[locale]/learn/[moduleId]/[slug]/page.tsx` | Lesson page: sidebar + MDX + checkpoints + complete/next. |
| `src/components/dashboard/ModuleCard.tsx` | (unchanged file) wrapped in a `<Link>` by the dashboard. |
| `app/[locale]/page.tsx` | Compute real module/overall progress; link cards to `/learn`. |
| `src/components/layout/HudHeader.tsx` | Add a "Learn" nav tab. |
| `messages/{en,fr}.json` | `nav.learn` + `learn` block + `checkpoint` block. |
| `app/globals.css` | Learn layout + callout + checkpoint styles. |

---

## Task 0: Feature branch

- [ ] **Create the branch** (work off `main`, which is now at the merged Plan 3):

```bash
cd /Users/quzhenrong/rpas-lms && git checkout main && git pull --ff-only && git checkout -b plan-4-lms-lessons
```

---

## Task 1: MDX toolchain + first bilingual lesson (Air Law / registration)

**Files:**
- Modify: `package.json`
- Create: `content/lessons/en/air-law/registration.mdx`, `content/lessons/fr/air-law/registration.mdx`

- [ ] **Step 1: Install MDX deps**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm add next-mdx-remote gray-matter
```

- [ ] **Step 2: Author the EN pilot lesson** — create `content/lessons/en/air-law/registration.mdx`

```mdx
---
title: "Registration & Marking"
order: 1
estMinutes: 6
certLevel: BASIC
---

Every drone (RPA) you fly for Basic or Advanced operations in Canada that weighs
**250 g up to 25 kg** must be **registered with Transport Canada** before its
first flight, and marked with its registration number.

## Who must register

If the aircraft is **over 250 grams and up to 25 kilograms**, it must be
registered. Sub-250 g "micro" drones are exempt from registration (but you still
must fly them safely and away from aircraft and people).

<Tip>
Registration costs a small fee per aircraft and is tied to **you** as the
registrant. You must be at least 14 for a Basic pilot certificate (or supervised).
</Tip>

## Marking the aircraft

Once registered, you receive a **registration number** that must be **clearly
marked on the aircraft** so it is legible. Fly without registering or marking and
you are operating illegally.

<Caution>
You must carry proof of registration (and your pilot certificate) whenever you
operate. Inspectors can ask to see both.
</Caution>

### Check your understanding

<Checkpoint questionId="air-law-0001" />

## Key takeaways

- 250 g–25 kg → **register before first flight** and **mark** the aircraft.
- Carry proof of registration + your pilot certificate when operating.
```

- [ ] **Step 3: Author the FR pilot lesson** — create `content/lessons/fr/air-law/registration.mdx`

```mdx
---
title: "Immatriculation et marquage"
order: 1
estMinutes: 6
certLevel: BASIC
---

Tout drone (SATP) que vous pilotez pour des opérations de base ou avancées au
Canada pesant **de 250 g à 25 kg** doit être **immatriculé auprès de Transports
Canada** avant son premier vol, et porter son numéro d'immatriculation.

## Qui doit immatriculer

Si l'aéronef pèse **plus de 250 grammes et jusqu'à 25 kilogrammes**, il doit être
immatriculé. Les micro-drones de moins de 250 g en sont exemptés (mais vous devez
quand même voler de façon sécuritaire, loin des aéronefs et des personnes).

<Tip>
L'immatriculation coûte des frais modiques par aéronef et est liée à **vous** en
tant que titulaire. Il faut avoir au moins 14 ans pour un certificat de pilote de
base (ou être supervisé).
</Tip>

## Marquage de l'aéronef

Une fois immatriculé, vous recevez un **numéro d'immatriculation** qui doit être
**clairement inscrit sur l'aéronef** de façon lisible. Voler sans immatriculer ni
marquer l'aéronef, c'est opérer illégalement.

<Caution>
Vous devez avoir sur vous la preuve d'immatriculation (et votre certificat de
pilote) lorsque vous opérez. Les inspecteurs peuvent exiger de les voir.
</Caution>

### Vérifiez votre compréhension

<Checkpoint questionId="air-law-0001" />

## Points clés

- 250 g–25 kg → **immatriculer avant le premier vol** et **marquer** l'aéronef.
- Ayez sur vous la preuve d'immatriculation + votre certificat de pilote.
```

> The `questionId` must be a real id in `content/question-bank.json`. `air-law-0001` exists. During Task 10, verify each `<Checkpoint>` references a real air-law question id; adjust if a chosen id doesn't exist.

- [ ] **Step 4: Commit**

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(lessons): add MDX deps + bilingual Air Law registration lesson"
```

---

## Task 2: Lesson catalog loader (frontmatter → metadata)

**Files:**
- Create: `src/lib/lessons/types.ts`, `src/lib/lessons/catalog.ts`, `src/lib/lessons/catalog.test.ts`

- [ ] **Step 1: Types + frontmatter schema** — create `src/lib/lessons/types.ts`

```typescript
import { z } from "zod";
import type { ModuleId } from "../content/types";

export const FrontmatterSchema = z.object({
  title: z.string().min(1),
  order: z.number().int().min(1),
  estMinutes: z.number().int().min(1),
  certLevel: z.enum(["BASIC", "ADVANCED", "BOTH"]),
});

export interface LessonMeta {
  lessonId: string; // `${moduleId}/${slug}`
  moduleId: string;
  slug: string;
  title: string;
  order: number;
  estMinutes: number;
  certLevel: "BASIC" | "ADVANCED" | "BOTH";
}

export type RouteLocale = "en" | "fr";
export type { ModuleId };
```

- [ ] **Step 2: Write the failing test** — create `src/lib/lessons/catalog.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { getModuleLessons, getLesson, getModuleLessonCount } from "./catalog";

describe("lesson catalog", () => {
  it("lists the Air Law lessons in order with metadata (EN)", () => {
    const lessons = getModuleLessons("en", "air-law");
    expect(lessons.length).toBeGreaterThanOrEqual(1);
    expect(lessons[0].lessonId).toBe("air-law/registration");
    expect(lessons[0].moduleId).toBe("air-law");
    expect(lessons[0].slug).toBe("registration");
    expect(lessons[0].order).toBe(1);
    expect(lessons[0].title).toBe("Registration & Marking");
    // sorted ascending by order
    const orders = lessons.map((l) => l.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("returns the localized title for FR", () => {
    const [first] = getModuleLessons("fr", "air-law");
    expect(first.title).toBe("Immatriculation et marquage");
    expect(first.lessonId).toBe("air-law/registration");
  });

  it("loads a single lesson body + meta, or null when missing", () => {
    const lesson = getLesson("en", "air-law", "registration");
    expect(lesson).not.toBeNull();
    expect(lesson!.meta.lessonId).toBe("air-law/registration");
    expect(lesson!.body).toContain("must be"); // body text, frontmatter stripped
    expect(lesson!.body).not.toContain("order:"); // frontmatter removed
    expect(getLesson("en", "air-law", "nope")).toBeNull();
  });

  it("counts lessons per module from the canonical (EN) tree", () => {
    expect(getModuleLessonCount("air-law")).toBe(getModuleLessons("en", "air-law").length);
    expect(getModuleLessonCount("meteorology")).toBe(0); // not authored yet
  });
});
```

- [ ] **Step 3: Run, verify FAIL**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/lessons/catalog.test.ts
```
Expected: FAIL — `./catalog` not found.

- [ ] **Step 4: Implement the loader** — create `src/lib/lessons/catalog.ts` (relative imports; Node fs)

```typescript
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { FrontmatterSchema, type LessonMeta, type RouteLocale } from "./types";

const LESSONS_ROOT = join(process.cwd(), "content", "lessons");

function moduleDir(locale: RouteLocale, moduleId: string): string {
  return join(LESSONS_ROOT, locale, moduleId);
}

function readMeta(locale: RouteLocale, moduleId: string, slug: string): LessonMeta | null {
  const file = join(moduleDir(locale, moduleId), `${slug}.mdx`);
  if (!existsSync(file)) return null;
  const fm = FrontmatterSchema.parse(matter(readFileSync(file, "utf8")).data);
  return { lessonId: `${moduleId}/${slug}`, moduleId, slug, ...fm };
}

/** All lessons for a module in a locale, sorted by `order`. [] if none. */
export function getModuleLessons(locale: RouteLocale, moduleId: string): LessonMeta[] {
  const dir = moduleDir(locale, moduleId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => readMeta(locale, moduleId, f.replace(/\.mdx$/, "")))
    .filter((m): m is LessonMeta => m !== null)
    .sort((a, b) => a.order - b.order);
}

/** One lesson's metadata + raw MDX body (frontmatter stripped), or null. */
export function getLesson(
  locale: RouteLocale,
  moduleId: string,
  slug: string,
): { meta: LessonMeta; body: string } | null {
  const meta = readMeta(locale, moduleId, slug);
  if (!meta) return null;
  const file = join(moduleDir(locale, moduleId), `${slug}.mdx`);
  const body = matter(readFileSync(file, "utf8")).content;
  return { meta, body };
}

/** Lesson count for a module from the canonical EN tree (locale-independent). */
export function getModuleLessonCount(moduleId: string): number {
  return getModuleLessons("en", moduleId).length;
}
```

- [ ] **Step 5: Run, verify PASS**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/lessons/catalog.test.ts
```
Expected: 4 passing.

- [ ] **Step 6: Full suite + typecheck + commit**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test && pnpm typecheck && git add -A && git commit -m "feat(lessons): fs-based lesson catalog loader with frontmatter validation"
```

---

## Task 3: LessonProgress persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/lessons/progress.ts`, `src/lib/lessons/progress.test.ts`

- [ ] **Step 1: Add the model** — in `prisma/schema.prisma`, add `lessonProgress LessonProgress[]` to `User`, and add:

```prisma
model LessonProgress {
  id          String   @id @default(cuid())
  userId      String
  lessonId    String
  completedAt DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id])

  @@unique([userId, lessonId])
  @@index([userId])
}
```
Add the relation field to `User` (keep existing fields):
```prisma
  lessonProgress LessonProgress[]
```

- [ ] **Step 2: Push schema to dev + test DBs**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm exec prisma db push
```
(The Vitest globalSetup already runs `prisma db push --force-reset` on `test.db`, so the test DB picks the new table up automatically.)

- [ ] **Step 3: Write the failing test** — create `src/lib/lessons/progress.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../db";
import { markLessonComplete, listCompletedLessonIds } from "./progress";

describe("lesson progress", () => {
  beforeEach(async () => {
    await prisma.lessonProgress.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({ data: { id: "u1", email: "u1@test.local", hashedPassword: "x" } });
    await prisma.user.create({ data: { id: "u2", email: "u2@test.local", hashedPassword: "x" } });
  });
  afterAll(async () => {
    await prisma.lessonProgress.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("marks a lesson complete and lists it (idempotent)", async () => {
    await markLessonComplete("u1", "air-law/registration");
    await markLessonComplete("u1", "air-law/registration"); // again → no duplicate
    const ids = await listCompletedLessonIds("u1");
    expect(ids).toEqual(["air-law/registration"]);
  });

  it("isolates progress per user", async () => {
    await markLessonComplete("u1", "air-law/registration");
    await markLessonComplete("u2", "air-law/airspace");
    expect(await listCompletedLessonIds("u1")).toEqual(["air-law/registration"]);
    expect(await listCompletedLessonIds("u2")).toEqual(["air-law/airspace"]);
  });
});
```

- [ ] **Step 4: Run, verify FAIL**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/lessons/progress.test.ts
```
Expected: FAIL — `./progress` not found.

- [ ] **Step 5: Implement** — create `src/lib/lessons/progress.ts` (relative imports)

```typescript
import { prisma } from "../db";

/** Upsert a completed lesson for a user (idempotent on [userId, lessonId]). */
export async function markLessonComplete(userId: string, lessonId: string): Promise<void> {
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId },
    update: {},
  });
}

/** All completed lessonIds for a user. */
export async function listCompletedLessonIds(userId: string): Promise<string[]> {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId },
    select: { lessonId: true },
  });
  return rows.map((r) => r.lessonId);
}
```

- [ ] **Step 6: Run, verify PASS; full suite + typecheck + commit**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test && pnpm typecheck && git add -A && git commit -m "feat(lessons): LessonProgress model + markLessonComplete/listCompletedLessonIds"
```

---

## Task 4: Progress + Checkpoint APIs

**Files:**
- Create: `app/api/progress/lesson/route.ts`, `app/api/checkpoint/[id]/route.ts`, `app/api/checkpoint/check/route.ts`, `app/api/checkpoint/checkpoint.test.ts`

- [ ] **Step 1: Write the failing checkpoint test** — create `app/api/checkpoint/checkpoint.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { GET as getCheckpoint } from "./[id]/route";
import { POST as checkCheckpoint } from "./check/route";
import { loadQuestionBank } from "../../../src/lib/content/loadBank";
import { correctOptionIds } from "../../../src/lib/exam/grade";

const bank = loadQuestionBank();
const sample = bank.questions.find((q) => q.moduleId === "air-law")!;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("checkpoint API", () => {
  it("GET returns the public question without isCorrect", async () => {
    const res = await getCheckpoint(new Request(`http://test?locale=en`), ctx(sample.id));
    expect(res.status).toBe(200);
    const text = await res.clone().text();
    expect(text).not.toContain("isCorrect");
    const body = await res.json();
    expect(body.id).toBe(sample.id);
    expect(Array.isArray(body.options)).toBe(true);
  });

  it("GET 404 for unknown id", async () => {
    const res = await getCheckpoint(new Request("http://test?locale=en"), ctx("nope-9999"));
    expect(res.status).toBe(404);
  });

  it("POST check grades correct vs incorrect and returns explanation", async () => {
    const right = await checkCheckpoint(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ questionId: sample.id, selectedOptionIds: correctOptionIds(sample), locale: "en" }),
      }),
    );
    const rbody = await right.json();
    expect(right.status).toBe(200);
    expect(rbody.correct).toBe(true);
    expect(rbody.explanation.length).toBeGreaterThan(0);

    const wrong = await checkCheckpoint(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ questionId: sample.id, selectedOptionIds: ["__no__"], locale: "en" }),
      }),
    );
    const wbody = await wrong.json();
    expect(wbody.correct).toBe(false);
    expect(Array.isArray(wbody.correctOptionIds)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test app/api/checkpoint/checkpoint.test.ts
```
Expected: FAIL — route modules not found.

- [ ] **Step 3: Implement `GET /api/checkpoint/[id]`** — create `app/api/checkpoint/[id]/route.ts`

```typescript
import { loadQuestionBank } from "../../../../src/lib/content/loadBank";
import { toPublicQuestion } from "../../../../src/lib/exam/serialize";

const bank = loadQuestionBank();
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const locale = new URL(req.url).searchParams.get("locale") === "fr" ? "FR" : "EN";
  const q = bank.questions.find((x) => x.id === id);
  if (!q) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(toPublicQuestion(q, locale), { status: 200 });
}
```

- [ ] **Step 4: Implement `POST /api/checkpoint/check`** — create `app/api/checkpoint/check/route.ts`

```typescript
import { z } from "zod";
import { loadQuestionBank } from "../../../../src/lib/content/loadBank";
import { correctOptionIds, isAnswerCorrect } from "../../../../src/lib/exam/grade";

const bank = loadQuestionBank();

const CheckBody = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()),
  locale: z.enum(["en", "fr"]).default("en"),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = CheckBody.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  const { questionId, selectedOptionIds, locale } = parsed.data;
  const q = bank.questions.find((x) => x.id === questionId);
  if (!q) return Response.json({ error: "not found" }, { status: 404 });
  const L = locale === "fr" ? "FR" : "EN";
  return Response.json(
    {
      correct: isAnswerCorrect(q, selectedOptionIds),
      correctOptionIds: correctOptionIds(q),
      explanation: q.explanation[L],
    },
    { status: 200 },
  );
}
```

- [ ] **Step 5: Implement `POST /api/progress/lesson`** — create `app/api/progress/lesson/route.ts`

```typescript
import { z } from "zod";
import { markLessonComplete } from "../../../../src/lib/lessons/progress";

const Body = z.object({ lessonId: z.string().min(1) });

async function currentUserId(): Promise<string | null> {
  try {
    const { auth } = await import("../../../../auth");
    const session = await auth();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "auth required" }, { status: 401 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  await markLessonComplete(userId, parsed.data.lessonId);
  return Response.json({ ok: true }, { status: 200 });
}
```

> The progress route's auth uses the same context-tolerant dynamic `auth()` as `POST /api/exam`. We are NOT writing a Vitest test for this route (it needs an authenticated request the unit harness can't forge cleanly); the `markLessonComplete` logic it calls is covered by Task 3. Smoke-test it live in Task 10/final.

- [ ] **Step 6: Run checkpoint test (PASS), full suite, typecheck, commit**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test app/api/checkpoint/checkpoint.test.ts && pnpm test && pnpm typecheck && git add -A && git commit -m "feat(lessons): progress + checkpoint API routes (server-graded)"
```

---

## Task 5: MDX render components

**Files:**
- Create: `src/components/learn/mdx/Callout.tsx`, `src/components/learn/MDXContent.tsx`

- [ ] **Step 1: Callout components** — create `src/components/learn/mdx/Callout.tsx`

```tsx
import type { ReactNode } from 'react';

function Callout({ kind, icon, children }: { kind: string; icon: string; children: ReactNode }) {
  return (
    <div className={`callout callout-${kind}`}>
      <span className="callout-icon">{icon}</span>
      <div className="callout-body">{children}</div>
    </div>
  );
}

export const Tip = ({ children }: { children: ReactNode }) => <Callout kind="tip" icon="▲" children={children} />;
export const Caution = ({ children }: { children: ReactNode }) => <Callout kind="caution" icon="!" children={children} />;
export const Note = ({ children }: { children: ReactNode }) => <Callout kind="note" icon="//" children={children} />;
```

- [ ] **Step 2: MDX renderer** — create `src/components/learn/MDXContent.tsx`

```tsx
import { MDXRemote } from 'next-mdx-remote/rsc';
import { Tip, Caution, Note } from '@/components/learn/mdx/Callout';
import Checkpoint from '@/components/learn/Checkpoint';

export default function MDXContent({ source, locale }: { source: string; locale: string }) {
  const components = {
    Tip,
    Caution,
    Note,
    Checkpoint: (props: { questionId: string }) => <Checkpoint {...props} locale={locale} />,
  };
  return (
    <div className="lesson-prose">
      {/* @ts-expect-error Async Server Component (MDXRemote/rsc) */}
      <MDXRemote source={source} components={components} />
    </div>
  );
}
```

> `Checkpoint` is created in Task 6; this import will not resolve until then. That's fine — Task 5 and Task 6 land together in the same branch; if you build between them, complete Task 6 first. (Implementer note: do Tasks 5 + 6 back-to-back; run `pnpm build` only after Task 6.)

- [ ] **Step 3: Typecheck (Checkpoint may be unresolved until Task 6) — defer build; commit**

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(lessons): MDX callout components + MDXRemote renderer"
```

---

## Task 6: Checkpoint island + gating context

**Files:**
- Create: `src/components/learn/lessonProgressContext.tsx`, `src/components/learn/Checkpoint.tsx`

- [ ] **Step 1: Gating context** — create `src/components/learn/lessonProgressContext.tsx`

```tsx
'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface Ctx {
  register: (id: string) => void;
  pass: (id: string) => void;
  allPassed: boolean;
}

const LessonCtx = createContext<Ctx | null>(null);

export function useLessonProgress(): Ctx {
  return useContext(LessonCtx) ?? { register: () => {}, pass: () => {}, allPassed: true };
}

export function LessonProgressProvider({ children }: { children: ReactNode }) {
  const [required, setRequired] = useState<Set<string>>(new Set());
  const [passed, setPassed] = useState<Set<string>>(new Set());

  const register = useCallback((id: string) => {
    setRequired((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, []);
  const pass = useCallback((id: string) => {
    setPassed((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, []);

  const allPassed = [...required].every((id) => passed.has(id));
  return <LessonCtx.Provider value={{ register, pass, allPassed }}>{children}</LessonCtx.Provider>;
}
```

- [ ] **Step 2: Checkpoint island** — create `src/components/learn/Checkpoint.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLessonProgress } from '@/components/learn/lessonProgressContext';

interface PublicQ {
  id: string;
  type: 'SINGLE' | 'MULTI';
  selectCount: number;
  stem: string;
  options: { id: string; label: string }[];
}

export default function Checkpoint({ questionId, locale }: { questionId: string; locale: string }) {
  const t = useTranslations('checkpoint');
  const { register, pass } = useLessonProgress();
  const [q, setQ] = useState<PublicQ | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [result, setResult] = useState<{ correct: boolean; explanation: string } | null>(null);

  useEffect(() => {
    register(questionId);
    let cancelled = false;
    fetch(`/api/checkpoint/${questionId}?locale=${locale}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setQ(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [questionId, locale, register]);

  if (!q) return <div className="checkpoint loading">{t('loading')}</div>;

  const toggle = (id: string) => {
    if (result?.correct) return;
    if (q.type === 'SINGLE') setSel([id]);
    else setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  async function check() {
    const res = await fetch('/api/checkpoint/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, selectedOptionIds: sel, locale }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setResult({ correct: data.correct, explanation: data.explanation });
    if (data.correct) pass(questionId);
  }

  return (
    <div className={`checkpoint${result ? (result.correct ? ' ok' : ' bad') : ''}`}>
      <div className="checkpoint-tag">// {t('title')}</div>
      <div className="checkpoint-stem">{q.stem}</div>
      {q.type === 'MULTI' && <div className="checkpoint-hint">{t('selectN', { count: q.selectCount })}</div>}
      <ul className="checkpoint-options">
        {q.options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className={`cp-opt${sel.includes(o.id) ? ' selected' : ''}`}
              onClick={() => toggle(o.id)}
              disabled={result?.correct}
            >
              {o.label}
            </button>
          </li>
        ))}
      </ul>
      {!result?.correct && (
        <button type="button" className="btn-launch cp-check" onClick={check} disabled={sel.length === 0}>
          {t('check')}
        </button>
      )}
      {result && (
        <div className={`checkpoint-feedback ${result.correct ? 'ok' : 'bad'}`}>
          <strong>{result.correct ? t('correct') : t('incorrect')}</strong>
          {result.correct && <p>{result.explanation}</p>}
          {!result.correct && <p>{t('tryAgain')}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit** (build verified in Task 7 once pages exist)

```bash
cd /Users/quzhenrong/rpas-lms && pnpm typecheck && git add -A && git commit -m "feat(lessons): checkpoint island + gating context"
```

---

## Task 7: Lesson page, sidebar, completion/next

**Files:**
- Create: `src/components/learn/CompleteButton.tsx`, `src/components/learn/LessonShell.tsx`, `src/components/learn/LessonSidebar.tsx`, `app/[locale]/learn/[moduleId]/page.tsx`, `app/[locale]/learn/[moduleId]/[slug]/page.tsx`

- [ ] **Step 1: Complete button** — create `src/components/learn/CompleteButton.tsx`

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useLessonProgress } from '@/components/learn/lessonProgressContext';

interface Props {
  lessonId: string;
  locale: string;
  nextHref: string | null;
  backHref: string;
}

export default function CompleteButton({ lessonId, locale, nextHref, backHref }: Props) {
  const t = useTranslations('learn');
  const router = useRouter();
  const { allPassed } = useLessonProgress();
  const [busy, setBusy] = useState(false);

  async function complete() {
    setBusy(true);
    await fetch('/api/progress/lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId }),
    }).catch(() => {});
    setBusy(false);
    router.push(nextHref ?? backHref);
    router.refresh();
  }

  return (
    <div className="lesson-actions">
      <Link href={backHref} className="btn-review">↩ {t('backToModule')}</Link>
      <button type="button" className="btn-launch" onClick={complete} disabled={!allPassed || busy}>
        {allPassed ? (nextHref ? `${t('completeNext')} ▶` : `${t('complete')} ✓`) : t('answerToContinue')}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Lesson shell (provides gating context around MDX + button)** — create `src/components/learn/LessonShell.tsx`

```tsx
'use client';

import type { ReactNode } from 'react';
import { LessonProgressProvider } from '@/components/learn/lessonProgressContext';
import CompleteButton from '@/components/learn/CompleteButton';

interface Props {
  children: ReactNode;
  lessonId: string;
  locale: string;
  nextHref: string | null;
  backHref: string;
}

export default function LessonShell({ children, lessonId, locale, nextHref, backHref }: Props) {
  return (
    <LessonProgressProvider>
      {children}
      <CompleteButton lessonId={lessonId} locale={locale} nextHref={nextHref} backHref={backHref} />
    </LessonProgressProvider>
  );
}
```

- [ ] **Step 3: Sidebar** — create `src/components/learn/LessonSidebar.tsx`

```tsx
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getModuleLessons } from '@/lib/lessons/catalog';

interface Props {
  locale: string;
  moduleId: string;
  currentSlug: string;
  completed: Set<string>;
}

export default async function LessonSidebar({ locale, moduleId, currentSlug, completed }: Props) {
  const t = await getTranslations({ locale });
  const lessons = getModuleLessons(locale as 'en' | 'fr', moduleId);
  const done = lessons.filter((l) => completed.has(l.lessonId)).length;
  const pct = lessons.length === 0 ? 0 : Math.round((done / lessons.length) * 100);

  return (
    <aside className="sidebar learn-sidebar">
      <div className="sidebar-section">
        <div className="section-label">{t(`modules.${moduleId}`)}</div>
        <div className="tele-row">
          <span className="tele-label">{pct}% {t('learn.completeLabel')}</span>
          <span className="tele-value">{done}/{lessons.length}</span>
        </div>
        <div className="tele-bar"><div className="tele-bar-fill" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="module-list">
        {lessons.map((l) => {
          const active = l.slug === currentSlug;
          const isDone = completed.has(l.lessonId);
          return (
            <Link
              key={l.lessonId}
              href={`/${locale}/learn/${moduleId}/${l.slug}`}
              className={`lesson-item${active ? ' active' : ''}`}
            >
              <span className={`lesson-check${isDone ? ' done' : ''}`}>{isDone ? '✓' : '○'}</span>
              <span className="lesson-title">{l.title}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Module landing page** — create `app/[locale]/learn/[moduleId]/page.tsx`

```tsx
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getModuleLessons } from '@/lib/lessons/catalog';

type Props = { params: Promise<{ locale: string; moduleId: string }> };

export default async function ModuleLanding({ params }: Props) {
  const { locale, moduleId } = await params;
  const t = await getTranslations({ locale });
  const lessons = getModuleLessons(locale as 'en' | 'fr', moduleId);

  return (
    <div className="module-landing">
      <div className="dash-callsign">{t('learn.title')}</div>
      <div className="dash-title">{t(`modules.${moduleId}`)}</div>
      {lessons.length === 0 ? (
        <div className="hud-panel coming-soon">{t('learn.comingSoon')}</div>
      ) : (
        <ul className="lesson-index">
          {lessons.map((l) => (
            <li key={l.lessonId}>
              <Link href={`/${locale}/learn/${moduleId}/${l.slug}`} className="hud-panel lesson-index-row">
                <span className="lesson-index-title">{l.title}</span>
                <span className="lesson-index-min">{l.estMinutes} min ▶</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Lesson page** — create `app/[locale]/learn/[moduleId]/[slug]/page.tsx`

```tsx
import { notFound } from 'next/navigation';
import { getLesson, getModuleLessons } from '@/lib/lessons/catalog';
import { listCompletedLessonIds } from '@/lib/lessons/progress';
import { auth } from '../../../../../auth';
import MDXContent from '@/components/learn/MDXContent';
import LessonShell from '@/components/learn/LessonShell';
import LessonSidebar from '@/components/learn/LessonSidebar';

type Props = { params: Promise<{ locale: string; moduleId: string; slug: string }> };

export default async function LessonPage({ params }: Props) {
  const { locale, moduleId, slug } = await params;
  const lesson = getLesson(locale as 'en' | 'fr', moduleId, slug);
  if (!lesson) notFound();

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const completed = new Set(userId ? await listCompletedLessonIds(userId) : []);

  const lessons = getModuleLessons(locale as 'en' | 'fr', moduleId);
  const idx = lessons.findIndex((l) => l.slug === slug);
  const next = idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null;
  const nextHref = next ? `/${locale}/learn/${moduleId}/${next.slug}` : null;
  const backHref = `/${locale}/learn/${moduleId}`;

  return (
    <div className="learn-layout">
      <LessonSidebar locale={locale} moduleId={moduleId} currentSlug={slug} completed={completed} />
      <article className="lesson-main">
        <h1 className="lesson-h1">{lesson.meta.title}</h1>
        <LessonShell lessonId={lesson.meta.lessonId} locale={locale} nextHref={nextHref} backHref={backHref}>
          <MDXContent source={lesson.body} locale={locale} />
        </LessonShell>
      </article>
    </div>
  );
}
```

- [ ] **Step 6: Build + typecheck** (now that all pieces exist)

```bash
cd /Users/quzhenrong/rpas-lms && pnpm typecheck && pnpm test && pnpm build
```
Expected: clean, 60+ tests pass, build succeeds with new routes `/[locale]/learn/[moduleId]` and `/[locale]/learn/[moduleId]/[slug]`. If `next-mdx-remote/rsc` triggers a build error, ensure the `@ts-expect-error` line above `MDXRemote` is present and that the lesson page is a Server Component (it is). Commit:

```bash
cd /Users/quzhenrong/rpas-lms && git add -A && git commit -m "feat(lessons): lesson page + sidebar + module landing + completion gating"
```

---

## Task 8: Real dashboard progress + module links

**Files:**
- Modify: `app/[locale]/page.tsx`, `src/components/dashboard/ExamSidebar.tsx`

- [ ] **Step 1: Compute progress + link cards** — in `app/[locale]/page.tsx`:

(a) add imports:
```tsx
import { getModuleLessonCount } from '@/lib/lessons/catalog';
import { listCompletedLessonIds } from '@/lib/lessons/progress';
```
(b) after the existing `const userId = session?.user?.id ?? null;` line, compute progress:
```tsx
  const completed = new Set(userId ? await listCompletedLessonIds(userId) : []);
  const moduleProgress = (id: string) => {
    const total = getModuleLessonCount(id);
    if (total === 0) return 0;
    const done = [...completed].filter((l) => l.startsWith(`${id}/`)).length;
    return Math.round((done / total) * 100);
  };
  const allTotals = MODULE_IDS.reduce((n, id) => n + getModuleLessonCount(id), 0);
  const overallPct = allTotals === 0 ? 0 : Math.round((completed.size / allTotals) * 100);
```
(c) replace the module-grid map to link each card to its module and pass real progress:
```tsx
        <div className="modules-grid">
          {MODULE_IDS.map((id, i) => (
            <Link key={id} href={`/${locale}/learn/${id}`} className="module-card-link">
              <ModuleCard moduleId={id} index={i + 1} progress={moduleProgress(id)} />
            </Link>
          ))}
        </div>
```
(d) replace the overall ring usage to use the real percentage:
```tsx
            <ProgressRing pct={overallPct} size={120} label={`${overallPct}%`} sublabel="COMPLETE" />
```

- [ ] **Step 2: Wire the dashboard sidebar module list** — in `src/components/dashboard/ExamSidebar.tsx`, make it reflect real progress. Replace the whole component with:

```tsx
import { getTranslations } from 'next-intl/server';
import { MODULE_IDS } from '@/lib/content/types';
import { getModuleLessonCount } from '@/lib/lessons/catalog';
import { listCompletedLessonIds } from '@/lib/lessons/progress';
import { auth } from '../../../auth';

export default async function ExamSidebar() {
  const t = await getTranslations();
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const completed = new Set(userId ? await listCompletedLessonIds(userId) : []);
  const totals = MODULE_IDS.reduce((n, id) => n + getModuleLessonCount(id), 0);
  const overall = totals === 0 ? 0 : Math.round((completed.size / totals) * 100);
  const pctFor = (id: string) => {
    const tot = getModuleLessonCount(id);
    if (tot === 0) return null;
    const done = [...completed].filter((l) => l.startsWith(`${id}/`)).length;
    return Math.round((done / tot) * 100);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="section-label">{t('dashboard.missionStatus')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="tele-row">
            <span className="tele-label">{t('dashboard.overallProgress')}</span>
            <span className="tele-value">{overall}%</span>
          </div>
          <div className="tele-bar"><div className="tele-bar-fill" style={{ width: `${overall}%` }} /></div>
        </div>
      </div>

      <div className="module-list">
        <div className="section-label" style={{ marginBottom: 8 }}>{t('dashboard.subjectAreas')}</div>
        {MODULE_IDS.map((id) => {
          const pct = pctFor(id);
          return (
            <div key={id} className="module-item">
              <div className={`module-icon${pct === null ? ' locked' : ''}`}>{pct === null ? '○' : pct === 100 ? '✓' : '◔'}</div>
              <div className="module-name">{t(`modules.${id}`)}</div>
              <div className="module-prog">{pct === null ? '—' : `${pct}%`}</div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Typecheck, test, build, commit**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm typecheck && pnpm test && pnpm build && git add -A && git commit -m "feat(dashboard): real module + overall lesson progress; cards link to lessons"
```

---

## Task 9: Learn nav tab + i18n + styles

**Files:**
- Modify: `src/components/layout/HudHeader.tsx`, `messages/en.json`, `messages/fr.json`, `app/globals.css`

- [ ] **Step 1: Add the "Learn" nav tab** — in `src/components/layout/HudHeader.tsx`:

(a) add an `isLearn` flag next to `isExam`:
```tsx
  const isLearn = pathname.startsWith(`/${locale}/learn`);
```
(b) in the `nav-tabs` block, add a Learn tab BEFORE the Exam tab:
```tsx
        <Link href={`/${locale}/learn/air-law`} className={`nav-tab${isLearn ? ' active' : ''}`}>
          {t('learn')}
        </Link>
```
(The `nav` namespace gets a `learn` key in Step 2.)

- [ ] **Step 2: Messages** — in `messages/en.json` add `"learn": "Learn"` to the `"nav"` object, and add these two top-level blocks (after `"review"`):

```json
  "learn": {
    "title": "Study Module",
    "completeLabel": "complete",
    "comingSoon": "Lessons for this module are coming soon.",
    "backToModule": "Back to module",
    "complete": "Mark Complete",
    "completeNext": "Complete & Next",
    "answerToContinue": "Answer the checkpoint to continue"
  },
  "checkpoint": {
    "title": "Apply Your Knowledge",
    "loading": "Loading…",
    "check": "Check Answer",
    "correct": "Correct",
    "incorrect": "Not quite",
    "tryAgain": "Review the lesson and try again.",
    "selectN": "Select {count}"
  }
```
> Key roles (no collision): `learn.completeLabel` = the lowercase word in the sidebar "% complete"; `learn.complete` = the "Mark Complete" button label (used by `CompleteButton` when there is no next lesson). `LessonSidebar` uses `learn.completeLabel`.

In `messages/fr.json` add `"learn": "Apprendre"` to `"nav"`, and:
```json
  "learn": {
    "title": "Module d'étude",
    "completeLabel": "terminé",
    "comingSoon": "Les leçons de ce module arrivent bientôt.",
    "backToModule": "Retour au module",
    "complete": "Marquer comme terminé",
    "completeNext": "Terminer et continuer",
    "answerToContinue": "Répondez au point de contrôle pour continuer"
  },
  "checkpoint": {
    "title": "Mettez vos connaissances à l'épreuve",
    "loading": "Chargement…",
    "check": "Vérifier la réponse",
    "correct": "Correct",
    "incorrect": "Pas tout à fait",
    "tryAgain": "Revoyez la leçon et réessayez.",
    "selectN": "Sélectionnez {count}"
  }
```
Verify both files parse and that EN/FR key trees are identical (`node -e "..."` parity check as in prior plans).

- [ ] **Step 3: Learn styles** — append to `app/globals.css`:

```css
/* ---- Learn / lessons ---- */
.learn-layout { display: flex; gap: 20px; align-items: flex-start; padding: 20px 24px; }
.learn-sidebar { min-width: 240px; }
.lesson-item { display: flex; align-items: center; gap: 8px; padding: 8px 6px; border-radius: 4px;
  text-decoration: none; color: rgba(255,255,255,0.7); font-family: var(--font-ui); font-size: 13px; }
.lesson-item:hover { background: rgba(0,212,255,0.06); }
.lesson-item.active { background: rgba(0,212,255,0.12); color: #fff; }
.lesson-check { width: 16px; color: rgba(255,255,255,0.4); }
.lesson-check.done { color: var(--green); }
.lesson-main { flex: 1; max-width: 760px; }
.lesson-h1 { font-family: var(--font-display); color: #fff; font-size: 24px; margin-bottom: 18px; }
.lesson-prose { font-family: var(--font-ui); color: rgba(255,255,255,0.85); line-height: 1.7; font-size: 15px; }
.lesson-prose h2 { font-family: var(--font-display); color: var(--cyan); font-size: 17px; margin: 24px 0 8px; }
.lesson-prose h3 { color: #fff; font-size: 15px; margin: 18px 0 6px; letter-spacing: 0.04em; }
.lesson-prose ul { padding-left: 20px; }
.lesson-prose strong { color: #fff; }
.callout { display: flex; gap: 10px; padding: 12px 14px; border-radius: 6px; margin: 14px 0;
  border-left: 3px solid; font-size: 14px; }
.callout-icon { font-family: var(--font-mono); font-weight: 700; }
.callout-tip { background: rgba(0,255,136,0.06); border-color: var(--green); }
.callout-caution { background: rgba(255,56,96,0.06); border-color: var(--red); }
.callout-note { background: rgba(0,212,255,0.06); border-color: var(--cyan); }
.lesson-actions { display: flex; justify-content: space-between; gap: 12px; margin-top: 28px; }
.module-card-link { text-decoration: none; }
.module-landing { padding: 24px; max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.coming-soon { padding: 28px; font-family: var(--font-mono); color: rgba(255,255,255,0.5); }
.lesson-index { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.lesson-index-row { display: flex; justify-content: space-between; align-items: center; padding: 16px;
  text-decoration: none; color: #fff; font-family: var(--font-ui); }
.lesson-index-min { color: var(--cyan); font-family: var(--font-mono); font-size: 12px; }
/* checkpoint */
.checkpoint { border: 1px solid rgba(0,212,255,0.25); border-radius: 8px; padding: 16px; margin: 20px 0;
  background: rgba(0,0,0,0.25); }
.checkpoint.ok { border-color: var(--green); }
.checkpoint.bad { border-color: var(--red); }
.checkpoint-tag { font-family: var(--font-mono); color: var(--cyan); font-size: 11px; letter-spacing: 0.1em; }
.checkpoint-stem { font-family: var(--font-ui); color: #fff; font-size: 15px; margin: 8px 0 12px; }
.checkpoint-hint { font-family: var(--font-mono); font-size: 11px; color: var(--amber); margin-bottom: 8px; }
.checkpoint-options { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.cp-opt { width: 100%; text-align: left; padding: 10px 12px; border-radius: 4px; cursor: pointer;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(0,212,255,0.2); color: rgba(255,255,255,0.85);
  font-family: var(--font-ui); font-size: 14px; }
.cp-opt.selected { border-color: var(--cyan); background: rgba(0,212,255,0.12); }
.cp-check { margin-top: 12px; }
.checkpoint-feedback { margin-top: 12px; font-family: var(--font-mono); font-size: 13px; }
.checkpoint-feedback.ok { color: var(--green); }
.checkpoint-feedback.bad { color: var(--red); }
.checkpoint-feedback p { color: rgba(255,255,255,0.8); margin-top: 6px; line-height: 1.5; }
```

- [ ] **Step 4: Typecheck, test, build, commit**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm typecheck && pnpm test && pnpm build && git add -A && git commit -m "feat(lessons): Learn nav tab + i18n (learn/checkpoint) + styles"
```

---

## Task 10: Author Air Law module + scaffold remaining modules

**Files:**
- Create: `content/lessons/{en,fr}/air-law/airspace.mdx`, `content/lessons/{en,fr}/air-law/site-survey.mdx`

- [ ] **Step 1: Author lesson 2 — "Where You Can Fly (Airspace)"** in both `content/lessons/en/air-law/airspace.mdx` and `content/lessons/fr/air-law/airspace.mdx`. Use `order: 2`, `estMinutes: 7`, `certLevel: BASIC`. Cover: controlled vs uncontrolled airspace, the 9 km / aerodrome rule for Basic, NAV Drone authorization, and altitude limits. Synthesize from the **`reference` and `explanation` fields of the air-law questions in `content/question-bank.json`** so content stays consistent with the bank. Include 1–2 `<Tip>`/`<Caution>` and **one `<Checkpoint questionId="air-law-XXXX" />`** referencing a real air-law question id about airspace (pick one by reading the bank). Mirror EN/FR exactly in structure.

- [ ] **Step 2: Author lesson 3 — "Site Survey & Operating Rules"** in both locales. `order: 3`, `estMinutes: 6`, `certLevel: BASIC`. Cover: pre-flight site survey, distance from bystanders, VLOS, max 122 m AGL, night ops basics. One checkpoint referencing a real air-law question id. Mirror EN/FR.

- [ ] **Step 3: Verify each `<Checkpoint questionId>` exists in the bank**

```bash
cd /Users/quzhenrong/rpas-lms && node -e '
const bank=require("./content/question-bank.json").questions.map(q=>q.id);
const fs=require("fs"); const glob=require("child_process").execSync("ls content/lessons/en/air-law/*.mdx content/lessons/fr/air-law/*.mdx").toString().split("\n").filter(Boolean);
let bad=0;
for(const f of glob){const ids=[...fs.readFileSync(f,"utf8").matchAll(/questionId="([^"]+)"/g)].map(m=>m[1]);
  for(const id of ids){ if(!bank.includes(id)){ console.log("MISSING",id,"in",f); bad++; } }}
console.log(bad? "FAIL: "+bad+" bad ids" : "OK: all checkpoint ids exist");
'
```
Expected: `OK: all checkpoint ids exist`. Fix any mismatches before continuing.

- [ ] **Step 4: Confirm catalog + counts pick up 3 lessons**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test src/lib/lessons/catalog.test.ts && node -e 'require("ts-node")' 2>/dev/null; echo "air-law lessons (en):" && ls content/lessons/en/air-law | wc -l
```

- [ ] **Step 5: Full verify + commit**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm typecheck && pnpm test && pnpm build && git add -A && git commit -m "content(air-law): author airspace + site-survey lessons (EN/FR) with checkpoints"
```

> The other 7 modules need NO files — `getModuleLessons` returns `[]` for them, so their dashboard cards show 0% and their module landing shows "coming soon" automatically. No scaffolding files required.

---

## Final review (after all tasks)

Dispatch a final whole-implementation reviewer, then **live smoke test**:

1. `pnpm test` green, `pnpm typecheck` clean, `pnpm build` green.
2. EN/FR message trees identical (run the parity check).
3. **Live:** `pnpm dev` →
   - `/en/learn/air-law` lists 3 lessons; `/en/learn/meteorology` shows "coming soon".
   - Open lesson 1 → callouts render → checkpoint loads, **wrong answer keeps "Complete & Next" disabled**, correct answer reveals explanation and enables it.
   - Signed in: clicking Complete advances to lesson 2 and the sidebar shows a ✓; dashboard module card + overall ring reflect the new %.
   - Guest: lesson reads fine; Complete returns 401 (button still navigates) — confirm no crash. (If guest UX matters, note it; gating guests is out of scope.)
   - FR: `/fr/learn/air-law/registration` shows French content + French checkpoint + French explanation.
4. Security: `GET /api/checkpoint/[id]` body has **no** `isCorrect`.

Then use **superpowers:finishing-a-development-branch** (the user merges via PR, like Plans 2–3).

---

## Known gaps / deferred

- **Only Air Law authored** (3 lessons). Other 7 modules are "coming soon" until content is written — the real ongoing work (mirrors the question-bank content bottleneck).
- **Guest progress:** guests can read lessons but Complete needs an account (401). No "sign in to save" prompt on the lesson page yet.
- **Checkpoint gating is per-page, client-side** (not persisted per-checkpoint). A refresh resets checkpoint state (lesson completion, once saved, persists).
- **No "resume where you left off"** affordance yet (design §5.1) — dashboard shows %, but no deep-link to the next incomplete lesson.
- **Deployment still pending** (SQLite local). When ready to ship: swap Prisma `provider` to `postgresql` + hosted DB (trivial — no array columns), set prod env, deploy to Vercel.
