# Admin Lesson Creation (CMS "Add Lesson") — Design

**Date:** 2026-06-13
**Status:** Approved (design), pending implementation plan

## Problem

The `/coriander` CMS can **edit** existing lessons but cannot **create** new ones.
Questions already have a working create flow ("+ New question" →
`questions/[id]` with `id === "new"` → `POST /api/coriander/questions`); lessons
have no equivalent:

- `app/coriander/lessons/page.tsx` has no "New lesson" button.
- `app/coriander/lessons/[id]/page.tsx` does not special-case `"new"`.
- `app/api/coriander/lessons/route.ts` exposes only `GET` (no `POST`).
- `LessonEditForm` treats `course`/`moduleId`/`slug`/`lessonId` as read-only.

This spec adds lesson creation, mirroring the established question-create
pattern. **Out of scope:** the question create flow (already complete and not
being changed).

## Constraints from the data model

`BasicLesson` / `AdvancedLesson` (column-identical, physically split tables):

- `lessonId String @unique` — must equal `"${course}/${moduleId}/${slug}"`. It is
  the stable key referenced by `LessonProgress` FKs.
- `@@unique([course, moduleId, slug])`.
- `course` is fixed per table (`basic` / `advanced`); a lesson cannot move tables.
- Required scalars on create: `lessonId, course, moduleId, slug, order,
  estMinutes, certLevel, access, titleEN, titleZH, bodyEN, bodyZH`. Video fields
  (`videoUid, videoStatus, videoDurationSec, videoThumbnailUrl`) are nullable and
  are **not** set at creation (video is attached later, in the edit page, once an
  `id` exists).

## Decisions (confirmed with user)

1. **Scope:** lesson creation only. Question create is untouched.
2. **Body optional:** `bodyEN/bodyZH` may be empty, to allow video-only lessons.
   The shared `adminLessonSchema` is relaxed so create *and* edit behave the same.
3. **Pattern:** Approach A — reuse the `[id]` route with `id === "new"` and add an
   `isNew` branch to `LessonEditForm`. No separate create component (avoids
   duplicating the form; matches the question convention).
4. **Post-create redirect:** go to the new lesson's **edit page**
   (`/coriander/lessons/${createdId}`), not the list — so the admin can
   immediately upload a video and keep editing.
5. **Slug:** admin-entered, validated as kebab-case
   (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). The form shows a live preview of the resulting
   `lessonId`.
6. **Order:** admin-entered (number, min 1, default 1). No auto "next order"
   computation — kept minimal, matching the question form. Can be added later.

## Architecture

```
List page  ──"+ New lesson"──▶  /coriander/lessons/new
                                      │  (page.tsx: id === "new" → LessonEditForm lesson={null})
                                      ▼
                              LessonEditForm (isNew)
                                      │  Create → POST /api/coriander/lessons
                                      ▼
                          POST handler: validate → build lessonId →
                          create in basic|advanced table → 201 {row}
                                      │
                                      ▼
                       redirect → /coriander/lessons/${row.id}  (edit page; video upload available)
```

### Component / file responsibilities

| File | Change | Responsibility |
|------|--------|----------------|
| `src/lib/admin/contentSchemas.ts` | modify | Relax `adminLessonSchema` body to allow empty; add `adminLessonCreateSchema` (extends with `course`, `moduleId`, `slug`). |
| `app/api/coriander/lessons/route.ts` | modify | Add `POST` — validate, build `lessonId`, conditional MDX validation, create row, map `P2002` → 409. |
| `app/coriander/lessons/[id]/page.tsx` | modify | `if (id === "new") return <LessonEditForm lesson={null} />`. |
| `app/coriander/lessons/[id]/LessonEditForm.tsx` | modify | Accept `lesson: LessonRow \| null`; `isNew` branch (editable course/module/slug + lessonId preview; video block hidden when new; Create vs Save; POST vs PUT; redirect to edit page on create). |
| `app/coriander/lessons/page.tsx` | modify | Add "+ New lesson" link to `/coriander/lessons/new`. |

No new files. No new dependencies.

## Validation (`contentSchemas.ts`)

```ts
// Relaxed: bodies may be empty (video-only lessons). Applies to edit + create.
export const adminLessonSchema = z.object({
  titleEN: z.string().min(1),
  titleZH: z.string().min(1),
  order: z.number().int().min(1),
  estMinutes: z.number().int().min(1),
  certLevel: z.enum(["BASIC", "ADVANCED", "BOTH"]),
  access: z.enum(["FREE", "PAID"]),
  bodyEN: z.string(),   // was .min(1)
  bodyZH: z.string(),   // was .min(1)
});

// Create adds the identity fields that Edit treats as read-only.
export const adminLessonCreateSchema = adminLessonSchema.extend({
  course: z.enum(["basic", "advanced"]),
  moduleId: z.enum(MODULE_IDS),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case"),
});
export type AdminLessonCreateInput = z.infer<typeof adminLessonCreateSchema>;
```

Relaxing the body to allow empty means the existing `PUT` handler's MDX
validation must be guarded so it only runs when a body is non-empty (it already
only runs when bodies changed; the additional guard is "and non-empty"). The new
`POST` applies the same rule.

## POST `/api/coriander/lessons`

```ts
export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const parsed = adminLessonCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const input = parsed.data;

  const lessonId = `${input.course}/${input.moduleId}/${input.slug}`;

  // Validate MDX only when a body is actually present (video-only lessons may be empty).
  if (input.bodyEN.trim() || input.bodyZH.trim()) {
    const result = await validateLessonMdxBodies({
      bodyEN: input.bodyEN, bodyZH: input.bodyZH, moduleId: input.moduleId, course: input.course,
    });
    if (!result.ok) return Response.json({ error: "MDX validation failed", details: result.errors }, { status: 422 });
  }

  const data = {
    lessonId, course: input.course, moduleId: input.moduleId, slug: input.slug,
    order: input.order, estMinutes: input.estMinutes, certLevel: input.certLevel,
    access: input.access, titleEN: input.titleEN, titleZH: input.titleZH,
    bodyEN: input.bodyEN, bodyZH: input.bodyZH,
  };

  try {
    const row = input.course === "basic"
      ? await prisma.basicLesson.create({ data })
      : await prisma.advancedLesson.create({ data });
    revalidatePath(`/en/learn/${input.course}/${input.moduleId}`);
    revalidatePath(`/zh/learn/${input.course}/${input.moduleId}`);
    return Response.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: `A lesson with slug "${input.slug}" already exists in ${input.course}/${input.moduleId}` }, { status: 409 });
    }
    throw e;
  }
}
```

Relying on the DB unique constraints (rather than a pre-check) avoids a
check-then-insert race.

## Form (`LessonEditForm` with `isNew`)

- Prop becomes `lesson: LessonRow | null`; `const isNew = lesson === null`.
- New state for create-only fields: `course` (default `"basic"`), `moduleId`
  (default first of `MODULE_IDS`), `slug` (default `""`).
- When `isNew`:
  - Replace the read-only "Course / Module / Slug" row with editable controls:
    course `<select>`, module `<select>` (from `MODULE_IDS`), slug `<input>`.
  - Show a live `lessonId` preview: `{course}/{moduleId}/{slug}`.
  - **Hide the `<VideoUpload>` block** (no `id` yet).
  - Title is "New lesson"; submit button reads "Create".
  - `handleSave` → `POST ${ADMIN_API_BASE}/lessons` with the create payload;
    on success `router.push(${ADMIN_BASE}/lessons/${created.id})` then `refresh()`.
- When editing (`lesson` present): unchanged — read-only identity row, video
  block visible, "Save" → existing `PUT`.
- Error handling reuses the existing `errors` list UI; surface `409`/`422`
  messages (the create response uses the same `{ error }` / `{ error.fieldErrors }`
  shapes the form already parses).

## Page (`lessons/[id]/page.tsx`)

```tsx
const { id } = await params;
if (id === "new") return <LessonEditForm lesson={null} />;
const found = await findLessonById(id);
if (!found) notFound();
return <LessonEditForm lesson={found.row} />;
```

## List page (`lessons/page.tsx`)

Add to the header (mirrors the question button):

```tsx
<Link href={`${ADMIN_BASE}/lessons/new`} className="btn-primary">+ New lesson</Link>
```

## Error handling summary

| Condition | Response |
|-----------|----------|
| Not admin | 404 (via `requireAdminApi`) |
| Schema invalid (missing title, bad slug, order < 1, …) | 422 `{ error: fieldErrors }` |
| Non-empty body fails MDX validation | 422 `{ error, details }` |
| Duplicate `lessonId` / `(course,moduleId,slug)` | 409 `{ error }` |
| Success | 201 `{ ...row }` |

## Testing

**Schema unit tests** (`adminLessonCreateSchema`):
- valid full payload passes;
- empty `bodyEN`/`bodyZH` passes (video-only);
- missing `titleEN` fails;
- non-kebab slug (e.g. `"Bad Slug"`, `"a_b"`, `"-x"`) fails;
- `order: 0` fails.

**POST route tests** (admin mocked):
- creates a basic lesson → 201, row in `basicLesson`, `lessonId` ===
  `basic/<module>/<slug>`;
- creates an advanced lesson → 201, row in `advancedLesson`;
- duplicate slug in same course+module → 409;
- empty bodies → 201 (no MDX validation error);
- non-admin → 404.

Follow existing test conventions in the repo (Vitest; mock `requireAdminApi` and
`prisma` the way current admin route tests do).

## Non-goals

- Changing or "fixing" the question create flow.
- Auto-computing the next `order`.
- Deleting lessons from the UI (no delete flow exists today; not added here).
- Allowing `course`/`moduleId`/`slug` to change after creation (still read-only in
  edit, preserving `LessonProgress` FK integrity).
