# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

RPAS LMS — a Next.js (App Router) learning + mock-exam platform for the Canadian RPAS / drone pilot certification, bilingual EN/ZH. Covers Basic & Advanced courses: lessons, lesson checkpoints, timed mock exams with server-side grading, Stripe payments, and a separate flight-review booking flow.

> The root `README.md` data-layer facts are now corrected (PostgreSQL + DB-backed CMS), but its `目录说明` predates several subsystems (the `/coriander` admin CMS, payments, lessons, flight-review). For those, trust the schema and the code over the README.

## Commands

```bash
pnpm dev              # next dev (http://localhost:3000/en, /zh)
pnpm build            # next build
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run (see DB requirement below)
pnpm test:watch
pnpm db:generate      # prisma generate
pnpm db:push          # prisma db push (sync schema to DATABASE_URL)
pnpm seed:content     # tsx scripts/seed-content.ts (loads lessons/questions into DB)
```

Run a single test file / test:

```bash
pnpm exec vitest run src/lib/exam/grade.test.ts
pnpm exec vitest run -t "name of the test"
```

### Tests require a local Postgres

Vitest runs against real Postgres (matching the prod provider), **not** an in-memory DB. Default URL is `postgresql://postgres:postgres@localhost:5433/postgres`; override with `TEST_DATABASE_URL`. Spin one up with:

```bash
docker run -d --name rpas-test-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
```

`vitest.globalSetup.ts` resets + `db push`es the schema before the suite. Tests run **sequentially** (`fileParallelism: false`) because every file shares one database. Test files live next to source as `*.test.ts` under `src/**` and `app/**`.

## Architecture

Stack: Next.js 15 App Router, React 19, TypeScript (strict), Prisma + **PostgreSQL**, NextAuth v5 (`auth.ts`), next-intl (en/zh), Tailwind, Zod, Vitest, Stripe, Resend (email), Cloudflare Stream (video), Sentry. Path alias `@/*` → `./src/*`.

### Two-table identity (security boundary)

Admins and customers are **physically separate tables** (`Admin`, `Customer`) with no shared `role` column — a customer row can never be escalated to admin. `auth.ts` wires NextAuth (JWT strategy) with these providers:

- `credentials` → customer password login (`authorizeLocalPasswordLogin`)
- `admin` → admin login with **TOTP MFA** (`authorizeAdminPasswordLogin`); sets `token.isAdmin`
- `google` / `apple` → OAuth, only registered when client id/secret env vars are present (`getOAuthProviderCredentials`)

The JWT callback re-derives `accessTier` from the `Entitlement` table on an explicit `session.update()` so a purchase takes effect without re-login. `session.user.isAdmin`/`accessTier` are display/nav hints only — every protected admin/exam route re-checks authorization server-side.

### Admin CMS (`/coriander`)

The admin surface lives at an intentionally non-obvious slug. `ADMIN_SLUG` in `src/lib/admin/route.ts` is the single source of truth (importable by client + middleware). `middleware.ts` excludes `ADMIN_BASE` from i18n locale handling, so admin pages are served at `/coriander/...` (no `/[locale]` prefix). To rename, change `ADMIN_SLUG` and rename `app/coriander` + `app/api/coriander`. Admins manage lessons, questions, checkpoints, flight-review slots, and their own MFA here.

### Content is DB-sourced (not JSON files)

Questions, lessons, and checkpoints are Prisma tables, edited through the CMS — `content/question-bank.json` is gone. Key conventions baked into the schema:

- Question banks are **split by cert level**: `BasicQuestionBank` / `AdvancedQuestionBank` (each with its own `*QuestionOption`). There is no "BOTH" — a question belongs to exactly one bank. Exam generation only reads `status: "ACTIVE"` rows. Loaders: `src/lib/content/loadBank.ts`, mappers: `dbMappers.ts`.
- `CheckpointQuestion` is a **separate table** from the exam banks (SEC-04) so the public per-lesson checkpoint endpoints can never reach exam answers. Assigned to a lesson via `lessonId`.
- Lessons are split `BasicLesson` / `AdvancedLesson`; `lessonId` (`"${course}/${moduleId}/${slug}"`) is the stable external id and the FK used by `*LessonProgress`. Bodies are raw MDX stored bilingually (`bodyEN`/`bodyZH`). Catalog access: `src/lib/lessons/catalog.ts`.

### Exam engine (`src/lib/exam/`)

The core domain logic. A single `ExamService` (`instance.ts`, cached on `globalThis`) backed by `PrismaSessionStore` orchestrates the lifecycle: create → fetch questions → answer → submit → result → review. Notable pieces:

- `generate.ts` + `quota.ts` + `rng.ts` — seeded, weighted paper generation per cert level/subject.
- `grade.ts` / `score.ts` — exact-set matching of selected option ids; subject-split scoring.
- `serialize.ts` — **server-side answer boundary**: strips `isCorrect`/`explanation`/`reference` before questions go to the client. Correct answers are only revealed post-submit via `review.ts`.
- `ExamSession` stores a `questionSnapshot` captured at creation — grading/review read the snapshot, so later question edits don't change an in-flight exam. Answers are JSON on the session row, not separate rows.

### Payments & entitlements (Stripe)

Two products (`src/lib/payments/config.ts`): `paid_access` (advanced bundle, unlocks full course/exam) and `flight_review` (standalone add-on). **`Entitlement` is the source of truth**; `Customer.accessTier` is a denormalized cache. Webhook (`app/api/payments/webhook/route.ts`) is idempotent via the `WebhookEvent` table. Flight-review purchase grants the entitlement but does **not** change `accessTier`. Eligibility helpers in `src/lib/payments/entitlements.ts` (`hasPaidAccess`, `canBookFlightReview`, admin grant/revoke).

### Flight Review booking

Admins publish dated `FlightReviewSlot`s; an eligible student books exactly one `FlightReviewBooking`. `slotId @unique` makes double-booking impossible at the DB level; a booking row's existence *is* the active booking (cancel = delete row, reschedule = move `slotId`). Booking emails via Resend (`src/lib/flightReview/notifications.ts`).

### Security conventions

The codebase tags hardening decisions with `SEC-NN` markers — grep for them and respect the invariant when touching nearby code. Cross-cutting pieces:

- **Rate limiting / lockout** lives in the DB (`RateLimit` table, `src/lib/security/rateLimit.ts`), not memory, so limits hold across stateless serverless instances.
- **Exam ownership**: `app/api/exam/sessionAuth.ts` — `requireExamOwner` / `currentAccount`. Anonymous (ownerless) sessions are reachable only by their unguessable id (the free Basic taster).
- **Test-auth backdoor** (`x-test-user-id` header) is gated on `NODE_ENV==="test"` **and** `ALLOW_TEST_AUTH==="1"` (set only in `vitest.config.mts`) — it can never re-enable in production.

### Mobile

`mobile/` is a Capacitor wrapper (iOS/Android) around the web app. Server components detect native clients via User-Agent: `src/lib/platform.server.ts` (`isNativeRequest`) / `src/lib/platform.ts` (`isNativeUA`). `app/api/mobile/` serves native-specific endpoints.

## Environment

Copy `.env.example` → `.env`. Required for most flows: `DATABASE_URL` (+ `DIRECT_URL` for migrations on pooled Postgres), `AUTH_SECRET`, `APP_URL`, Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ADVANCED_BUNDLE_PRICE_ID`, optional `STRIPE_FLIGHT_REVIEW_PRICE_ID`), Resend (`RESEND_API_KEY`, `EMAIL_FROM`). OAuth and Sentry vars are optional (features no-op without them). Stripe TEST keys/prices belong in `.env`, LIVE in `.env.production` — price ids must come from the matching Stripe mode.

Local dev/test admin & customer accounts and the scripts to (re)create them (`scripts/create-admin.ts`, `scripts/create-customer.ts`) are documented at the bottom of `README.md`.

## Further reading

- `docs/technical-design.md` — full platform design.
- `docs/PROGRESS.md` — implementation history and known gaps.
- `docs/SECURITY_REMEDIATION.md` — what the `SEC-NN` markers mean.
- `LAUNCH_CHECKLIST.md` — pre-launch blockers and status.
