# Admin Lesson Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "New lesson" create flow to the `/coriander` CMS, mirroring the existing question-create pattern, so admins can author lessons (including video-only) directly into the database.

**Architecture:** Reuse the `lessons/[id]` route with `id === "new"` (the convention questions already use). The `POST /api/coriander/lessons` route is thin glue; the create logic lives in a testable `createLesson` helper in `src/lib/admin/lessons.ts`. Validation is a new `adminLessonCreateSchema`; the shared lesson body becomes optional to allow video-only lessons.

**Tech Stack:** Next.js 15 App Router, React 19 client components, Prisma/PostgreSQL, Zod, Vitest (tests run against the shared dev DB — no mocking).

**Spec:** `docs/superpowers/specs/2026-06-13-admin-lesson-create-design.md`

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/lib/admin/contentSchemas.ts` | modify | Relax `adminLessonSchema` bodies to allow empty; add `adminLessonCreateSchema`. |
| `src/lib/admin/contentSchemas.test.ts` | create | Unit tests for `adminLessonCreateSchema`. |
| `src/lib/admin/lessons.ts` | modify | Add `createLesson()` helper (build `lessonId`, route to table, map duplicate). |
| `src/lib/admin/lessons.test.ts` | create | DB-backed tests for `createLesson()`. |
| `app/api/coriander/lessons/route.ts` | modify | Add `POST` (guard, validate, conditional MDX, call helper, map 409, revalidate). |
| `app/api/coriander/lessons/[id]/route.ts` | modify | Guard PUT's MDX validation so it skips empty bodies. |
| `app/coriander/lessons/[id]/page.tsx` | modify | Special-case `id === "new"` → `<LessonEditForm lesson={null} />`. |
| `app/coriander/lessons/[id]/LessonEditForm.tsx` | modify | `isNew` branch: editable course/module/slug + `lessonId` preview, hide video, Create→POST, redirect to edit page. |
| `app/coriander/lessons/page.tsx` | modify | Add "+ New lesson" button. |

No new dependencies. No new top-level files beyond the two test files.

---

## Task 1: Schema — allow empty bodies + add create schema

**Files:**
- Modify: `src/lib/admin/contentSchemas.ts:74-85`
- Test: `src/lib/admin/contentSchemas.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin/contentSchemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { adminLessonCreateSchema } from "./contentSchemas";

// "air-law" is a real entry in MODULE_IDS (it is the default module in the
// admin questions UI), so it satisfies the moduleId enum.
const base = {
  course: "basic",
  moduleId: "air-law",
  slug: "intro-to-air-law",
  titleEN: "Intro",
  titleZH: "介绍",
  order: 1,
  estMinutes: 5,
  certLevel: "BASIC",
  access: "FREE",
  bodyEN: "Some body.",
  bodyZH: "正文。",
};

describe("adminLessonCreateSchema", () => {
  it("accepts a complete valid payload", () => {
    expect(adminLessonCreateSchema.safeParse(base).success).toBe(true);
  });

  it("accepts empty bodies (video-only lessons)", () => {
    const r = adminLessonCreateSchema.safeParse({ ...base, bodyEN: "", bodyZH: "" });
    expect(r.success).toBe(true);
  });

  it("rejects a missing title", () => {
    const { titleEN, ...rest } = base;
    expect(adminLessonCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-kebab slugs", () => {
    for (const slug of ["Bad Slug", "a_b", "-x", "x-", "UPPER"]) {
      expect(adminLessonCreateSchema.safeParse({ ...base, slug }).success).toBe(false);
    }
  });

  it("accepts a valid kebab slug with digits", () => {
    expect(adminLessonCreateSchema.safeParse({ ...base, slug: "module-01-intro" }).success).toBe(true);
  });

  it("rejects order below 1", () => {
    expect(adminLessonCreateSchema.safeParse({ ...base, order: 0 }).success).toBe(false);
  });

  it("rejects an unknown course", () => {
    expect(adminLessonCreateSchema.safeParse({ ...base, course: "expert" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/admin/contentSchemas.test.ts`
Expected: FAIL — `adminLessonCreateSchema` is not exported (import error / undefined).

- [ ] **Step 3: Modify the schema**

In `src/lib/admin/contentSchemas.ts`, change the two body fields in `adminLessonSchema` from `.min(1)` to `.string()` (allow empty for video-only lessons), then add the create schema. Replace lines 74-85:

```ts
/**
 * Validates an admin lesson-edit payload. `course`/`moduleId`/`slug`/`lessonId`
 * are read-only (changing them would break LessonProgress FKs) and are not part
 * of this payload. MDX body safety is checked separately by mdxValidation.
 * Bodies may be empty so a lesson can be video-only.
 */
export const adminLessonSchema = z.object({
  titleEN: z.string().min(1),
  titleZH: z.string().min(1),
  order: z.number().int().min(1),
  estMinutes: z.number().int().min(1),
  certLevel: z.enum(["BASIC", "ADVANCED", "BOTH"]),
  access: z.enum(["FREE", "PAID"]),
  bodyEN: z.string(),
  bodyZH: z.string(),
});

export type AdminLessonInput = z.infer<typeof adminLessonSchema>;

/**
 * Create payload adds the identity fields that the edit form treats as
 * read-only. `lessonId` is derived server-side as `${course}/${moduleId}/${slug}`.
 */
export const adminLessonCreateSchema = adminLessonSchema.extend({
  course: z.enum(["basic", "advanced"]),
  moduleId: z.enum(MODULE_IDS),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case (a-z, 0-9, hyphens)"),
});

export type AdminLessonCreateInput = z.infer<typeof adminLessonCreateSchema>;
```

(`MODULE_IDS` is already imported at the top of this file and already used by `adminQuestionSchema`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/admin/contentSchemas.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/contentSchemas.ts src/lib/admin/contentSchemas.test.ts
git commit -m "feat(admin): lesson create schema + allow empty lesson bodies"
```

---

## Task 2: `createLesson` helper

**Files:**
- Modify: `src/lib/admin/lessons.ts`
- Test: `src/lib/admin/lessons.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin/lessons.test.ts` (DB-backed, following the `questions.test.ts` convention: isolated module id + cleanup):

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { createLesson } from "./lessons";

// An isolated module id no fixture uses, so the shared dev DB is untouched.
const MOD = "zzz-lesson-create-test";

const base = {
  moduleId: MOD,
  order: 1,
  estMinutes: 5,
  certLevel: "BASIC",
  access: "FREE",
  titleEN: "T",
  titleZH: "标题",
  bodyEN: "",
  bodyZH: "",
};

async function cleanup() {
  await prisma.basicLesson.deleteMany({ where: { moduleId: MOD } });
  await prisma.advancedLesson.deleteMany({ where: { moduleId: MOD } });
}

describe("createLesson", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("creates a basic lesson with a derived lessonId", async () => {
    const res = await createLesson({ ...base, course: "basic", slug: "intro" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row.course).toBe("basic");
    expect(res.row.lessonId).toBe(`basic/${MOD}/intro`);
    expect(res.row.id).toBeTruthy();
    expect(await prisma.basicLesson.count({ where: { moduleId: MOD } })).toBe(1);
  });

  it("creates an advanced lesson in the advanced table", async () => {
    const res = await createLesson({ ...base, course: "advanced", slug: "intro" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row.lessonId).toBe(`advanced/${MOD}/intro`);
    expect(await prisma.advancedLesson.count({ where: { moduleId: MOD } })).toBe(1);
    expect(await prisma.basicLesson.count({ where: { moduleId: MOD } })).toBe(0);
  });

  it("reports DUPLICATE when the same course/module/slug already exists", async () => {
    const first = await createLesson({ ...base, course: "basic", slug: "dupe" });
    expect(first.ok).toBe(true);
    const second = await createLesson({ ...base, course: "basic", slug: "dupe" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("DUPLICATE");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/admin/lessons.test.ts`
Expected: FAIL — `createLesson` is not exported.

- [ ] **Step 3: Implement the helper**

Append to `src/lib/admin/lessons.ts` (keep the existing `findLessonById`). Add the `Prisma` import to the existing imports at the top:

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { Course } from "../lessons/types";
```

Then add:

```ts
export type LessonCreateData = {
  course: Course;
  moduleId: string;
  slug: string;
  order: number;
  estMinutes: number;
  certLevel: string;
  access: string;
  titleEN: string;
  titleZH: string;
  bodyEN: string;
  bodyZH: string;
};

/** Creates a lesson in the table named by `course`. `lessonId` is derived as
 *  `${course}/${moduleId}/${slug}` (the stable key referenced by LessonProgress).
 *  Relies on the DB unique constraints to detect collisions (no check-then-insert
 *  race): a Prisma P2002 maps to `{ ok: false, reason: "DUPLICATE" }`. */
export async function createLesson(input: LessonCreateData) {
  const lessonId = `${input.course}/${input.moduleId}/${input.slug}`;
  const data = {
    lessonId,
    course: input.course,
    moduleId: input.moduleId,
    slug: input.slug,
    order: input.order,
    estMinutes: input.estMinutes,
    certLevel: input.certLevel,
    access: input.access,
    titleEN: input.titleEN,
    titleZH: input.titleZH,
    bodyEN: input.bodyEN,
    bodyZH: input.bodyZH,
  };
  try {
    const row =
      input.course === "basic"
        ? await prisma.basicLesson.create({ data })
        : await prisma.advancedLesson.create({ data });
    return { ok: true as const, row };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false as const, reason: "DUPLICATE" as const };
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/admin/lessons.test.ts`
Expected: PASS — all three cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/lessons.ts src/lib/admin/lessons.test.ts
git commit -m "feat(admin): createLesson helper with derived lessonId and duplicate mapping"
```

---

## Task 3: POST route + PUT MDX guard

**Files:**
- Modify: `app/api/coriander/lessons/route.ts` (add POST)
- Modify: `app/api/coriander/lessons/[id]/route.ts:40-51` (skip MDX validation on empty bodies)

This task is route glue. The repo has no route-handler test harness (only pure/DB unit tests, which Tasks 1–2 cover); it is verified by typecheck (Step 3) and the manual smoke test in Task 7.

- [ ] **Step 1: Add the POST handler**

In `app/api/coriander/lessons/route.ts`, add these imports below the existing two (match the existing relative-path style in this file):

```ts
import { revalidatePath } from "next/cache";
import { adminLessonCreateSchema } from "../../../../src/lib/admin/contentSchemas";
import { validateLessonMdxBodies } from "../../../../src/lib/admin/mdxValidation";
import { createLesson } from "../../../../src/lib/admin/lessons";
```

Append the handler after the existing `GET`:

```ts
/** POST /api/<admin>/lessons — create a lesson in the table named by `course`. */
export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const parsed = adminLessonCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const input = parsed.data;

  // Validate MDX only when a body is actually present (video-only lessons may be empty).
  if (input.bodyEN.trim() || input.bodyZH.trim()) {
    const result = await validateLessonMdxBodies({
      bodyEN: input.bodyEN,
      bodyZH: input.bodyZH,
      moduleId: input.moduleId,
      course: input.course,
    });
    if (!result.ok) {
      return Response.json({ error: "MDX validation failed", details: result.errors }, { status: 422 });
    }
  }

  const created = await createLesson(input);
  if (!created.ok) {
    return Response.json(
      { error: `A lesson with slug "${input.slug}" already exists in ${input.course}/${input.moduleId}` },
      { status: 409 },
    );
  }

  // Surface the new lesson on its module listing immediately, in both locales.
  revalidatePath(`/en/learn/${input.course}/${input.moduleId}`);
  revalidatePath(`/zh/learn/${input.course}/${input.moduleId}`);

  return Response.json(created.row, { status: 201 });
}
```

- [ ] **Step 2: Guard the PUT MDX validation against empty bodies**

In `app/api/coriander/lessons/[id]/route.ts`, replace the body-validation block (lines 40-51):

```ts
  // Validate MDX only when bodies changed AND are non-empty (video-only lessons
  // may legitimately have empty bodies).
  const bodiesChanged = input.bodyEN !== existing.bodyEN || input.bodyZH !== existing.bodyZH;
  const hasBody = input.bodyEN.trim().length > 0 || input.bodyZH.trim().length > 0;
  if (bodiesChanged && hasBody) {
    const result = await validateLessonMdxBodies({
      bodyEN: input.bodyEN,
      bodyZH: input.bodyZH,
      moduleId: existing.moduleId,
      course,
    });
    if (!result.ok) {
      return Response.json({ error: "MDX validation failed", details: result.errors }, { status: 422 });
    }
  }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — no type errors. (Confirms the new imports, the `createLesson` result shape, and `revalidatePath` usage are sound.)

- [ ] **Step 4: Commit**

```bash
git add app/api/coriander/lessons/route.ts "app/api/coriander/lessons/[id]/route.ts"
git commit -m "feat(admin): POST /lessons create route; skip MDX validation on empty bodies"
```

---

## Task 4: Route the `new` page

**Files:**
- Modify: `app/coriander/lessons/[id]/page.tsx`

- [ ] **Step 1: Special-case `"new"`**

Replace the body of `AdminLessonEditPage` in `app/coriander/lessons/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { findLessonById } from "@/lib/admin/lessons";
import LessonEditForm from "./LessonEditForm";

type Props = { params: Promise<{ id: string }> };

export default async function AdminLessonEditPage({ params }: Props) {
  const { id } = await params;
  if (id === "new") return <LessonEditForm lesson={null} />;
  const found = await findLessonById(id);
  if (!found) notFound();
  return <LessonEditForm lesson={found.row} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL — `LessonEditForm` does not yet accept `lesson={null}` (its prop is `lesson: LessonRow`). This is expected and fixed in Task 5. Do not commit yet; proceed to Task 5.

(If you prefer a clean commit boundary, you may stage this file and commit it together with Task 5.)

---

## Task 5: `LessonEditForm` — `isNew` branch

**Files:**
- Modify: `app/coriander/lessons/[id]/LessonEditForm.tsx`

No component-test harness exists in the repo; verified by typecheck (Step 2) and the manual smoke test in Task 7.

- [ ] **Step 1: Rewrite the form to support create + edit**

Replace the entire contents of `app/coriander/lessons/[id]/LessonEditForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MODULE_IDS } from "@/lib/content/types";
import { ADMIN_BASE, ADMIN_API_BASE } from "@/lib/admin/route";
import VideoUpload from "./VideoUpload";

type LessonRow = {
  id: string;
  lessonId: string;
  course: string;
  moduleId: string;
  slug: string;
  order: number;
  estMinutes: number;
  certLevel: string;
  access: string;
  titleEN: string;
  titleZH: string;
  bodyEN: string;
  bodyZH: string;
  videoUid: string | null;
  videoStatus: string | null;
};

type Props = { lesson: LessonRow | null };

export default function LessonEditForm({ lesson }: Props) {
  const router = useRouter();
  const isNew = lesson === null;

  // Identity fields — editable only when creating (read-only once a lesson exists,
  // because lessonId is an FK target for LessonProgress).
  const [course, setCourse] = useState(lesson?.course ?? "basic");
  const [moduleId, setModuleId] = useState(lesson?.moduleId ?? MODULE_IDS[0]);
  const [slug, setSlug] = useState(lesson?.slug ?? "");

  const [titleEN, setTitleEN] = useState(lesson?.titleEN ?? "");
  const [titleZH, setTitleZH] = useState(lesson?.titleZH ?? "");
  const [order, setOrder] = useState(lesson?.order ?? 1);
  const [estMinutes, setEstMinutes] = useState(lesson?.estMinutes ?? 5);
  const [certLevel, setCertLevel] = useState(lesson?.certLevel ?? "BASIC");
  const [access, setAccess] = useState(lesson?.access ?? "FREE");
  const [bodyEN, setBodyEN] = useState(lesson?.bodyEN ?? "");
  const [bodyZH, setBodyZH] = useState(lesson?.bodyZH ?? "");

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function applyErrors(data: { details?: string[]; error?: unknown }) {
    if (data.details) {
      setErrors(data.details);
    } else if (
      data.error &&
      typeof data.error === "object" &&
      "fieldErrors" in data.error
    ) {
      const fe = (data.error as { fieldErrors: Record<string, string[]> }).fieldErrors;
      setErrors(Object.values(fe).flat());
    } else {
      setErrors([typeof data.error === "string" ? data.error : "Save failed"]);
    }
  }

  async function handleSave() {
    setSaving(true);
    setErrors([]);
    try {
      const url = isNew
        ? `${ADMIN_API_BASE}/lessons`
        : `${ADMIN_API_BASE}/lessons/${lesson!.id}`;
      const method = isNew ? "POST" : "PUT";
      const payload = isNew
        ? { course, moduleId, slug, titleEN, titleZH, order, estMinutes, certLevel, access, bodyEN, bodyZH }
        : { titleEN, titleZH, order, estMinutes, certLevel, access, bodyEN, bodyZH };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        applyErrors(await res.json());
        return;
      }
      if (isNew) {
        // Redirect to the edit page so the admin can upload a video next.
        const created = (await res.json()) as { id: string };
        router.push(`${ADMIN_BASE}/lessons/${created.id}`);
      } else {
        router.push(`${ADMIN_BASE}/lessons`);
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>{isNew ? "New lesson" : "Edit lesson"}</h1>
        {!isNew && <span className="admin-readonly-badge">{lesson!.lessonId}</span>}
      </div>

      {errors.length > 0 && (
        <ul className="admin-errors">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      <div className="admin-form">
        {/* Identity: editable on create, read-only when editing */}
        {isNew ? (
          <>
            <div className="admin-form-row">
              <label>Course</label>
              <select value={course} onChange={(e) => setCourse(e.target.value)}>
                <option value="basic">basic</option>
                <option value="advanced">advanced</option>
              </select>
            </div>
            <div className="admin-form-row">
              <label>Module</label>
              <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
                {MODULE_IDS.map((id) => <option key={id}>{id}</option>)}
              </select>
            </div>
            <div className="admin-form-row">
              <label>Slug</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="kebab-case-slug"
              />
            </div>
            <div className="admin-form-row">
              <label>Lesson ID</label>
              <span className="admin-readonly">{course}/{moduleId}/{slug || "…"}</span>
            </div>
          </>
        ) : (
          <div className="admin-form-row">
            <label>Course / Module / Slug</label>
            <span className="admin-readonly">{lesson!.course} / {lesson!.moduleId} / {lesson!.slug}</span>
          </div>
        )}

        <div className="admin-form-row">
          <label>Title EN</label>
          <input value={titleEN} onChange={(e) => setTitleEN(e.target.value)} />
        </div>
        <div className="admin-form-row">
          <label>Title ZH</label>
          <input value={titleZH} onChange={(e) => setTitleZH(e.target.value)} />
        </div>
        <div className="admin-form-row">
          <label>Order</label>
          <input type="number" min={1} value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        </div>
        <div className="admin-form-row">
          <label>Est. minutes</label>
          <input type="number" min={1} value={estMinutes} onChange={(e) => setEstMinutes(Number(e.target.value))} />
        </div>
        <div className="admin-form-row">
          <label>Cert level</label>
          <select value={certLevel} onChange={(e) => setCertLevel(e.target.value)}>
            <option>BASIC</option>
            <option>ADVANCED</option>
            <option>BOTH</option>
          </select>
        </div>
        <div className="admin-form-row">
          <label>Access</label>
          <select value={access} onChange={(e) => setAccess(e.target.value)}>
            <option>FREE</option>
            <option>PAID</option>
          </select>
        </div>

        {/* Video upload needs an existing lesson id, so it only appears when editing. */}
        {!isNew && (
          <VideoUpload lessonId={lesson!.id} videoUid={lesson!.videoUid} videoStatus={lesson!.videoStatus} />
        )}

        {/* MDX bodies — D2/D3 note */}
        <p className="admin-hint">
          Bodies are raw MDX (may be left empty for a video-only lesson). Checkpoints use{" "}
          <code>{'<Checkpoint questionId="air-law-0001" />'}</code>.
          EN and ZH must reference the same set of questionIds.
        </p>
        <div className="admin-form-row admin-form-row--tall">
          <label>Body EN (MDX)</label>
          <textarea
            value={bodyEN}
            onChange={(e) => setBodyEN(e.target.value)}
            rows={20}
            className="admin-mdx-textarea"
            spellCheck={false}
          />
        </div>
        <div className="admin-form-row admin-form-row--tall">
          <label>Body ZH (MDX)</label>
          <textarea
            value={bodyZH}
            onChange={(e) => setBodyZH(e.target.value)}
            rows={20}
            className="admin-mdx-textarea"
            spellCheck={false}
          />
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : isNew ? "Create" : "Save"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — `page.tsx` (Task 4) now type-checks against `lesson: LessonRow | null`.

- [ ] **Step 3: Commit**

```bash
git add "app/coriander/lessons/[id]/LessonEditForm.tsx" "app/coriander/lessons/[id]/page.tsx"
git commit -m "feat(admin): lesson create form (isNew branch) + new-page route"
```

---

## Task 6: "+ New lesson" button on the list

**Files:**
- Modify: `app/coriander/lessons/page.tsx:37-40`

- [ ] **Step 1: Add the button to the header**

In `app/coriander/lessons/page.tsx`, replace the page header block:

```tsx
      <div className="admin-page-header">
        <h1>Lessons</h1>
        <Link href={`${ADMIN_BASE}/lessons/new`} className="btn-primary">
          + New lesson
        </Link>
      </div>
```

(`Link` and `ADMIN_BASE` are already imported in this file.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/coriander/lessons/page.tsx
git commit -m "feat(admin): + New lesson button on lessons list"
```

---

## Task 7: Full verification + manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS — all suites green, including the new `contentSchemas.test.ts` and `lessons.test.ts`.

- [ ] **Step 2: Typecheck the whole project**

Run: `pnpm typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server (`pnpm dev`), sign in to `/coriander` as admin, then:

1. Lessons list → click **+ New lesson**. The form shows editable Course / Module / Slug and a live **Lesson ID** preview.
2. Create a **text lesson**: pick `basic` / a module, slug `smoke-test-text`, fill titles + a short body, click **Create**.
   - Expected: redirected to `/coriander/lessons/<id>` (edit page); the Video block is now visible.
3. Create a **video-only lesson**: slug `smoke-test-video`, fill titles, leave both bodies empty, **Create**.
   - Expected: succeeds (no MDX/validation error); redirected to edit page.
4. Try a **duplicate**: + New lesson, same course/module, slug `smoke-test-text` again, **Create**.
   - Expected: red error "A lesson with slug "smoke-test-text" already exists in basic/<module>".
5. Try a **bad slug** `Bad Slug`, **Create**.
   - Expected: validation error listed.
6. Visit the public module page `/<locale>/learn/<course>/<module>` — the new lesson(s) appear in the list.
7. Clean up the smoke-test lessons via the DB or leave them if harmless on the dev DB.

- [ ] **Step 4: Final commit (only if Step 3 surfaced fixes)**

```bash
git add -A
git commit -m "fix(admin): address lesson-create smoke-test findings"
```

---

## Notes for the implementer

- **Tests hit the real shared dev DB.** Use the isolated `MOD` ids exactly as written (`zzz-lesson-create-test`) and keep the `cleanup()` hooks so the suite stays idempotent. This mirrors `src/lib/admin/questions.test.ts`.
- **`requireAdminApi()` already returns a 404 `Response` for non-admins** (not 403); the POST route returns it directly via `if (deny) return deny`. This is covered by `src/lib/auth/adminGuard.test.ts`; do not re-test it per route.
- **Do not** make `course`/`moduleId`/`slug` editable in the edit (non-new) path — they are FK-stable identifiers.
- The `applyErrors` helper handles all three server error shapes: `{ details }` (MDX), `{ error: { fieldErrors } }` (Zod 422), and `{ error: string }` (409).
