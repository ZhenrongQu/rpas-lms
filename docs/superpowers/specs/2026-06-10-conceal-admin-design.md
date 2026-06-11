# Design: Conceal the admin surface

**Date:** 2026-06-10
**Status:** Approved (pending spec review)
**Branch:** `conceal-admin-surface`

## Context

The admin CMS currently lives at `/[locale]/admin` (e.g. `/en/admin`, `/zh/admin`).
Authorization is already correct and is **not** changing: `requireAdmin` /
`requireAdminApi` in [src/lib/auth/adminGuard.ts](../../../src/lib/auth/adminGuard.ts)
re-check `role === "ADMIN"` against the DB on every request (DB is the source of truth).

Two problems with the current setup, both about **information leakage**, not the
auth boundary:

1. **The redirect leaks the route.** Non-admins hitting `/admin` get
   `redirect('/signin')`, which confirms the path exists.
2. **The path is guessable.** `/admin` is a well-known CMS convention that
   scanners probe.

This is defense-in-depth (obscurity), explicitly **not** a security boundary. The
real boundary (the DB role check) is unchanged.

## Goal

Make the admin surface indistinguishable from a non-existent path for anyone who
is not a verified admin, and move it off the guessable, locale-prefixed URL.

## Non-goals

- Changing the authorization model (DB role check stays as-is).
- Redesigning the admin dashboard UX (out of scope this round).
- Changing how admins are designated (still `role = ADMIN` in the DB).
- Truly hiding the API path from someone who reads the client JS bundle (the edit
  forms `fetch` it, so the path is necessarily present in the bundle — see
  "Known limitations").

## Behavior changes

1. **404 instead of redirect.** Non-admins — logged out *or* logged in without the
   `ADMIN` role — receive `notFound()` (HTTP 404) on both the page and the
   `/api/<slug>/*` routes. Guessing the admin URL returns the same response as any
   dead URL. (API changes from `403` to `404` for uniform invisibility.)
2. **New unguessable path, no locale prefix.** Admin moves from `/[locale]/admin`
   to a top-level `/<slug>`. The old `/en/admin` and `/zh/admin` cease to exist
   (→ 404). The admin API moves from `/api/admin/*` to `/api/<slug>/*`.

**Chosen slug:** `coriander` → page base `/coriander`, API base `/api/coriander`.

## Why this conceals the path

- Next.js App Router does **not** ship route folder names to the browser, so
  outsiders cannot enumerate routes.
- The only behavioral leak was the redirect — removed by the 404 change.
- Nothing in the public site links to admin (verified: the only admin nav links
  live inside the gated admin layout), so the new slug never appears in any
  public page.

## Rename ergonomics — single source of truth

New file `src/lib/admin/route.ts` holds the slug. Plain string constants only — no
server-only imports — so it is safe to import from client components, middleware,
and server components alike.

```ts
// src/lib/admin/route.ts
export const ADMIN_SLUG = "coriander"; // change to rename; also rename the two route folders
export const ADMIN_BASE = `/${ADMIN_SLUG}`;        // page base, e.g. "/coriander"
export const ADMIN_API_BASE = `/api/${ADMIN_SLUG}`; // API base, e.g. "/api/coriander"
```

All admin links, redirects, and `fetch` calls import these constants. The
middleware short-circuits `ADMIN_BASE` in its **function body** (runtime), not in
the static `config.matcher`, so the slug is not duplicated into the matcher
literal.

**To rename later:** change `ADMIN_SLUG` and rename the two route folders
(`app/<slug>` and `app/api/<slug>`). Two folders + one constant.

## File changes

### New
- `src/lib/admin/route.ts` — the slug constants above.

### Move (git mv — preserves history)
- `app/[locale]/admin/` → `app/coriander/`
- `app/api/admin/` → `app/api/coriander/`

Relative import depth is unchanged by both moves (`admin` → `coriander` is the same
number of path segments), so the existing relative imports inside the API route
handlers remain valid.

### Edit inside the moved page tree (`app/coriander/`)
- `layout.tsx` — drop `params`/`locale`; call `await requireAdmin()`; build nav
  links from `ADMIN_BASE`; "← Back to site" → `` /`${routing.defaultLocale}`/dashboard ``.
- `page.tsx` — drop `locale`; links from `ADMIN_BASE`.
- `questions/page.tsx` — drop `locale` param; links from `ADMIN_BASE`.
- `lessons/page.tsx` — drop `locale` param; links from `ADMIN_BASE`.
- `questions/[id]/page.tsx` — drop `locale` from `params`; drop the `locale` prop
  passed to `QuestionEditForm`.
- `lessons/[id]/page.tsx` — drop `locale` from `params`; drop the `locale` prop
  passed to `LessonEditForm`.
- `questions/[id]/QuestionEditForm.tsx` — remove the `locale` prop; `router.push`
  targets `` `${ADMIN_BASE}/questions` ``; `fetch` targets `` `${ADMIN_API_BASE}/questions` ``
  and `` `${ADMIN_API_BASE}/questions/${id}` ``.
- `lessons/[id]/LessonEditForm.tsx` — remove the `locale` prop; `router.push`
  targets `` `${ADMIN_BASE}/lessons` ``; `fetch` targets `` `${ADMIN_API_BASE}/lessons/${id}` ``.

### Edit elsewhere
- `src/lib/auth/adminGuard.ts` — `requireAdmin()` loses its `locale` parameter and
  calls `notFound()` instead of `redirect(...)`; `requireAdminApi()` returns a 404
  Response instead of 403.
- `middleware.ts` — wrap the next-intl middleware; if the request pathname starts
  with `ADMIN_BASE`, return `NextResponse.next()` (skip locale handling); otherwise
  delegate to the next-intl middleware. The `config.matcher` stays as-is.

No CSS changes — class names (`.admin-layout`, `.admin-nav`, etc.) are unchanged.

## Known limitations

- The string `/api/coriander` appears in the client JS bundle because the admin
  edit forms `fetch` it. Renaming only stops it from matching the obvious
  `/api/admin` convention that scanners probe; it does not hide it from someone who
  reads your bundle. This is accepted: the endpoint is role-protected and returns
  404 to non-admins, so it reveals nothing actionable, and it does not expose the
  admin *page* path.
- The slug lives in the codebase / git history. Anyone with repo access knows it.
  This is the accepted trade-off of the "secret in code" approach (vs. an env-var
  secret path). Rotating the slug requires a code change + redeploy.

## Verification

- `pnpm typecheck` — clean.
- `pnpm build` — succeeds; build route list shows `/coriander` (and
  `/coriander/...`) and `/api/coriander/...`, with no `/[locale]/admin` or
  `/api/admin`.
- `pnpm test` — still green (no admin API tests exist that assert 403).
- Manual smoke:
  - `/coriander` as an admin → CMS loads; Questions/Lessons CRUD works
    (save + redirect land back on `/coriander/...`).
  - `/coriander` logged out, and logged in as a non-admin → 404.
  - Old `/en/admin` and `/zh/admin` → 404.
  - `/api/coriander/questions` unauthenticated → 404.

## Risks

- **Low.** The change is mechanical (move + drop a prop + swap two guard return
  values + one middleware wrapper). The auth boundary is untouched. The main risk
  is a missed link/`fetch` that still points at the old path — mitigated by
  centralizing on `ADMIN_BASE` / `ADMIN_API_BASE` and a post-change grep for any
  residual `"/admin"` or `"/api/admin"` string.
