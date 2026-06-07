# Design — Web + iOS Compatible Architecture

> Status: proposed · Date: 2026-06-07
> Scope: architecture direction only. This document does not implement the iOS app.

## 1. Goal

Prepare RPAS LMS so the current Web product can keep moving while a future iOS app
can consume the same backend capabilities without major rewrites.

The near-term target is not to build a native app immediately. The target is to
reshape the current Next.js project into:

- a Web client,
- stable API contracts,
- shared domain/service logic,
- a future-ready mobile authentication path,
- content formats that can serve both Web and iOS.

## 2. Non-Goals

- Do not split into a separate backend service now.
- Do not convert the repo into a monorepo yet.
- Do not choose SwiftUI vs React Native yet.
- Do not implement payment, mobile tokens, or lesson rendering in this design step.
- Do not rewrite the current exam engine if a boundary wrapper is enough.

## 3. Recommendation

Use a **modular single-repo architecture inside the existing Next.js app**.

Keep Next.js as the deployable app for now, but make the internal boundaries look
like a backend that any client can consume.

Recommended shape:

```text
app/
  [locale]/                 # Web pages
  api/                      # API routes for Web and future mobile

src/
  components/               # Web-only React UI
  i18n/                     # Web locale routing
  lib/
    api/                    # request/response schemas, DTOs, response helpers
    domain/                 # pure business rules
    services/               # app services used by API routes and Web pages
    auth/                   # auth helpers/providers/adapters
    content/                # content loaders and schemas
    exam/                   # existing exam engine, gradually folded behind services
    db.ts                   # Prisma client
```

This avoids the cost of a premature backend split while making future extraction
possible.

## 4. Architecture Principles

### 4.1 API-first for business capability

Every future iOS capability should have a stable JSON API.

Examples:

```text
/api/mobile/me
/api/mobile/auth/*
/api/mobile/catalog
/api/mobile/lessons/*
/api/mobile/exam/*
/api/mobile/purchase/*
```

The Web app can keep using server components and route handlers, but business
rules must not be trapped inside React pages.

### 4.2 Domain rules are client-neutral

Rules like these belong in shared domain/service code, not pages:

- `GUEST` can only view intro content.
- `FREE` can access Basic free content and `difficulty: 0` questions.
- `PAID` can access the full bank and Advanced content.
- Correct answers never leave the server before exam submission.
- Review data is available only after submission and only to the session owner.

### 4.3 API routes stay thin

Route handlers should do four things:

1. authenticate/authorize,
2. parse and validate input,
3. call a service,
4. return a stable response shape.

They should not contain exam generation, account linking, payment policy, or
content selection logic directly.

### 4.4 Web UI remains Web-only

`src/components/` can stay optimized for Web. Future iOS should not depend on Web
React components, CSS classes, or page-specific data shapes.

## 5. Proposed Layer Responsibilities

### `src/lib/domain/`

Pure rules with minimal dependencies.

Examples:

- access policy,
- exam grading rules,
- answer correctness,
- subscription tier rules,
- lesson visibility rules.

These functions should be easy to test without Prisma, Auth.js, or Next.js.

### `src/lib/services/`

Application use cases. Services can depend on Prisma, content loaders, and domain
rules.

Initial service candidates:

```text
src/lib/services/authService.ts
src/lib/services/examService.ts
src/lib/services/lessonService.ts
src/lib/services/userService.ts
src/lib/services/purchaseService.ts
```

Current code already has strong pieces:

- `src/lib/auth/account.ts`
- `src/lib/auth/verificationCode.ts`
- `src/lib/exam/service.ts`
- `src/lib/exam/access.ts`
- `src/lib/content/loadBank.ts`

The migration should wrap or move these gradually instead of rewriting them.

### `src/lib/api/`

Shared API contracts:

- Zod request schemas,
- response DTO types,
- error response helpers,
- pagination/metadata conventions,
- mobile-safe output projections.

Example:

```ts
type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

The exact wrapper can be decided later, but response consistency should become a
standard before mobile work starts.

## 6. Mobile-Ready Authentication

Current Web auth:

- Auth.js cookie/JWT session.
- Google OAuth.
- Apple OAuth.
- email/SMS verification code.
- verified legacy email/password login.

Future iOS auth should add a mobile-specific flow instead of reusing browser-only
cookies directly.

Recommended future flow:

1. iOS uses native Apple/Google SDK or email/SMS code screen.
2. iOS sends identity token or verification code to backend.
3. Backend verifies the provider/code.
4. Backend returns mobile tokens.
5. iOS uses bearer token for mobile API calls.

Mobile token design should include:

- short-lived access token,
- refresh token,
- server-side revocation or rotation,
- device/session record,
- logout endpoint.

This can coexist with Auth.js for Web. Web does not need to switch away from
Auth.js immediately.

## 7. API Surface for Future iOS

### User/session

```text
GET  /api/mobile/me
POST /api/mobile/auth/apple
POST /api/mobile/auth/google
POST /api/mobile/auth/code/request
POST /api/mobile/auth/code/verify
POST /api/mobile/auth/logout
```

### Catalog and lessons

```text
GET /api/mobile/catalog
GET /api/mobile/lessons/:lessonId
POST /api/mobile/lessons/:lessonId/complete
```

### Exam

```text
POST /api/mobile/exam
GET  /api/mobile/exam/:id/questions
POST /api/mobile/exam/:id/answer
POST /api/mobile/exam/:id/submit
GET  /api/mobile/exam/:id/result
GET  /api/mobile/exam/:id/review
```

### Purchase/access

```text
GET  /api/mobile/access
POST /api/mobile/purchase/ios/verify-receipt
```

These endpoints do not have to be implemented immediately. The point is to design
current services so they can support this surface later.

## 8. Content Strategy for Web and iOS

Question bank is already JSON and mobile-friendly.

Lessons need care. MDX is excellent for Web but not ideal as an iOS data format.

Recommended path:

1. Author lessons as MDX or structured markdown for Web.
2. Keep frontmatter stable: `title`, `order`, `estMinutes`, `certLevel`, `access`.
3. Add a build/load step that can project lessons into mobile-readable blocks.

Possible mobile block format:

```ts
type LessonBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; kind: "tip" | "caution" | "note"; text: string }
  | { type: "image"; url: string; alt: string }
  | { type: "checkpoint"; questionId: string };
```

This lets Web render rich content while iOS renders native views.

## 9. Payment and Access Tier

Payment is out of scope now, but access design should anticipate iOS.

Future purchase service should:

- store entitlement state on the server,
- verify App Store receipts server-side,
- map purchase state to `accessTier`,
- avoid trusting client-side purchase flags,
- keep Web and iOS entitlement rules identical.

The core rule remains:

```text
server-side entitlement decides access
```

## 10. Migration Plan

### Phase 1 — Stabilize contracts

- Add `src/lib/api/` with shared request/response schemas for existing auth and
  exam APIs.
- Normalize API error shapes.
- Document existing Web API contracts.
- Keep behavior unchanged.

### Phase 2 — Extract service boundaries

- Move route-level business logic into service functions.
- Keep route handlers thin.
- Add tests at the service boundary.
- Preserve existing route tests.

### Phase 3 — Lesson content API readiness

- Define lesson metadata schema.
- Define mobile-readable lesson block projection.
- Keep MDX rendering for Web.

### Phase 4 — Mobile auth design and token support

- Add mobile auth endpoints.
- Add mobile session/device model.
- Verify Apple/Google identity tokens server-side.
- Add refresh token rotation.

### Phase 5 — iOS client decision

After API and auth boundaries are stable, choose:

- SwiftUI for best native experience, or
- React Native/Expo for faster cross-platform iteration.

## 11. Testing Strategy

Each migration phase should preserve:

- existing `pnpm test`,
- `pnpm typecheck`,
- `pnpm build`.

New tests should focus on:

- API contract schemas,
- access policy shared by Web/mobile,
- auth token exchange,
- exam ownership checks,
- lesson block projection,
- payment entitlement verification.

## 12. Open Decisions

These should remain explicit until implementation time:

- SwiftUI vs React Native is intentionally undecided.
- Mobile token storage details depend on the final iOS stack.
- Lesson authoring format can stay MDX now, but mobile projection must be defined
  before native app work starts.
- Payment provider timing depends on when `PAID` access is sold.

## 13. Acceptance Criteria

This architecture direction is successful when:

- Web behavior stays unchanged.
- API contracts are stable enough for mobile clients.
- Business rules live in services/domain modules, not page components.
- Auth has a clear Web path and future mobile path.
- Course/question/payment access rules are enforced server-side.
- Future iOS work can start without scraping Web pages or duplicating business
  rules in the app.

