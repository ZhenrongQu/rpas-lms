# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

RPAS LMS — a Next.js (App Router) learning + mock-exam platform for the Canadian RPAS / drone pilot certification, bilingual EN/ZH. Covers Basic & Advanced courses: lessons, lesson checkpoints, timed mock exams with server-side grading, Stripe payments, a flight-review booking flow, a paid AI study assistant, and a native mobile (iOS) API surface.

> Docs: `README.md` is English (default), `README.zh.md` is the Chinese version (linked at the top of each). Its `目录说明` predates several subsystems (the `/coriander` admin CMS, payments, lessons, flight-review, the AI assistant, the native mobile API). For those, trust the schema and the code over the README.

## Commands

```bash
pnpm dev              # next dev (http://localhost:3000/en, /zh)
pnpm build            # next build
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run (see DB requirement below)
pnpm test:watch
pnpm db:generate      # prisma generate
pnpm db:push          # prisma db push (sync schema to DATABASE_URL)
pnpm db:indexes       # apply prisma/sql/*.sql — partial unique indexes db push CANNOT create
pnpm db:verify        # deploy gate: exits non-zero if indexes or the credit migration are missing
pnpm seed:content     # tsx scripts/seed-content.ts (loads lessons/questions into DB)
```

**`db:push` is not sufficient on its own.** `db:indexes` applies `prisma/sql/*` —
Row Level Security (`001-rls.sql`) and the partial (WHERE-clause) unique indexes
(`002-…`), neither of which the Prisma schema can express. It must follow every
push, in test setup (handled by `vitest.globalSetup.ts`) and in production;
`--force-reset` cascades the RLS function and event trigger away too. Skipping it
fails silently: the Flight Review booking uniqueness guarantees degrade to
application-level checks, and Supabase's anon/authenticated roles stop being
denied by default. `db:verify` turns that silence into a non-zero exit; the full
deploy sequence is in `docs/qa/release-checklist.md` §1.7.1.

### Which database a command talks to

Until 2026-08-26 `.env` held the **production** connection string while being
named, documented, and treated as dev — the two Supabase projects are named the
opposite way round from the env files that referenced them
(`pacificdrone-prod` = us-west-1 = what `.env` pointed at; `pacificdrone-dev` =
ca-central-1 = what `.env.production` pointed at, and it is paused). A full
release rehearsal, including `db push --accept-data-loss`, ran against
production before anyone noticed. Current layout:

| Where | Database |
|---|---|
| `.env` | local Postgres, `localhost:5433/rpas_dev` |
| `.env.production` | **no** DB URL — `next start` loads this file, so a real one here means a local production build talks to production |
| Vercel | production and preview, both `sensitive` (write-only — nobody can read them back, including the owner) |
| `.secrets/prod-db.env` | production, gitignored, **loaded by nothing** — source it deliberately for a one-off migration |

Every ops script prints `→ target: <host>/<db>` before its first query, and
every one that writes refuses a non-local target unless `ALLOW_REMOTE_DB_WRITE=1`.
**Read that line.** Covered: `db:push`, `db:indexes`, `db:verify`,
`migrate-flight-review-credits`, `seed:content`, `seed-test-fixtures.ts`,
`migrate-checkpoints.ts`, `create-admin.ts`, `create-customer.ts`,
`eval:assistant` (it creates and deletes `Customer` rows) and `scripts/kb/*`.
`verify-schema` only reads, so it announces its target without refusing a remote
one; `scripts/agents/*` carry their own local-only host checks. The guard is one call — `guardDbWrite()` from
`src/lib/ops/dbTarget.ts` — as the first statement of `main()`; a read-only dry
run passes `{ dryRun: true }`, which announces the target without demanding the
opt-in. Four of those files are local-only (untracked), so their wiring lives on
this checkout and will not survive a fresh clone.

Why the guard has to resolve the URL itself: `@prisma/client` loads `.env` when
it is imported, even under `tsx`, which does not. So a plain
`tsx scripts/whatever.ts` connects to whatever that file names with nothing on
screen to say which database that is — the exact shape of the 2026-08-26
incident. `guardDbWrite()` calls `loadEnvFile()` for the same reason.

A real deploy against production:

```bash
set -a; . ./.secrets/prod-db.env; set +a
DATABASE_URL="$PROD_DATABASE_URL" DIRECT_URL="$PROD_DIRECT_URL" \
  ALLOW_REMOTE_DB_WRITE=1 pnpm db:push
```

`tsx` does not load `.env` the way the Prisma CLI and Next do — an ops script
that wraps them must call `loadEnvFile()` from `src/lib/ops/dbTarget.ts`, or its
target check inspects one database while the command reshapes another.

`prisma/migrations/` is **not executed by anything** — this project uses `db push`.
It is a historical record only, and it lags the schema by 8 models. Do not add to
it; hardening that must actually run belongs in `prisma/sql/`.

**pnpm is pinned** via `packageManager` in `package.json`. If `node_modules` was
built by a different pnpm major, every `pnpm add` fails with a store-location
error and the only fix is `rm -rf node_modules && pnpm install`. Check with
`grep packageManager node_modules/.modules.yaml`.

Run a single test file / test:

```bash
pnpm exec vitest run src/lib/exam/grade.test.ts
pnpm exec vitest run -t "name of the test"
```

### Tests require a local Postgres

Vitest runs against real Postgres (matching the prod provider), **not** an in-memory DB. Default URL is `postgresql://postgres:postgres@localhost:5433/postgres`; override with `TEST_DATABASE_URL`. Spin one up with:

```bash
docker run -d --name rpas-test-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 pgvector/pgvector:pg16
```

The `pgvector/pgvector` image (not stock `postgres:16`) is required: the RAG `KnowledgeChunk` table has a pgvector `vector` column, so `prisma db push` needs the `vector` extension available.

`vitest.globalSetup.ts` resets + `db push`es the schema before the suite. Tests run **sequentially** (`fileParallelism: false`) because every file shares one database. Test files live next to source as `*.test.ts` under `src/**` and `app/**`.

## Architecture

Stack: Next.js 15 App Router, React 19, TypeScript (strict), Prisma + **PostgreSQL**, NextAuth v5 (`auth.ts`), next-intl (en/zh), Tailwind, Zod, Vitest, Stripe, Resend (email), Cloudflare Stream (video), Anthropic SDK (AI assistant), Sentry. Path alias `@/*` → `./src/*`.

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

### Paid AI study assistant (`/api/chat`)

`POST /api/chat` (Node runtime, streams plain UTF-8 text deltas). Gating order matters and happens before any tokens are spent: session `userId` required (401) → `hasPaidAccess` paywall (402) → per-user rate limit (429, with `Retry-After`). Returns 503 if `ANTHROPIC_API_KEY` is unset (the rest of the app is unaffected). `src/lib/chat/loop.ts` (`runAssistant`) is a server-side agent loop: model `claude-sonnet-4-6`, adaptive thinking, `MAX_STEPS` cap; the model calls tools (`src/lib/chat/tools.ts`, executed server-side), only text deltas are forwarded to the client. System prompt in `systemPrompt.ts`. Offline eval harness: `scripts/eval/` via `pnpm eval:assistant` (LLM-judge in `judge.ts`).

### Mobile (native iOS API)

Two distinct things share the `mobile`/native surface:

- **Web wrapper**: `mobile/` is a Capacitor shell (iOS/Android) around the web app. Server components detect native clients via User-Agent: `src/lib/platform.server.ts` (`isNativeRequest`) / `src/lib/platform.ts` (`isNativeUA`).
- **Native API**: `app/api/mobile/*` is a separate JSON API for the native app (auth, me, dashboard, courses, lessons, exam, checkpoint, progress) — it parallels the web routes but authenticates with a **bearer token, not NextAuth cookies**. `src/lib/mobile/session.ts` manages the `MobileSession` table: opaque token returned at login, stored sha256-hashed, 30-day expiry, revocable; `bearerToken()` parses the `Authorization` header and `readMobileSession()` validates it.

## Environment

Copy `.env.example` → `.env`. Required for most flows: `DATABASE_URL` (+ `DIRECT_URL` for migrations on pooled Postgres), `AUTH_SECRET`, `APP_URL`, Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ADVANCED_BUNDLE_PRICE_ID`, optional `STRIPE_FLIGHT_REVIEW_PRICE_ID`), Resend (`RESEND_API_KEY`, `EMAIL_FROM`). `ANTHROPIC_API_KEY` powers the AI assistant (route 503s without it; rest of app fine). OAuth, Cloudflare Stream, and Sentry vars are optional (features no-op without them). Stripe TEST keys/prices belong in `.env`, LIVE in `.env.production` — price ids must come from the matching Stripe mode.

`.gitignore` note: only `README.md`, `README.zh.md`, `CLAUDE.md`, and `scripts/eval/*` are tracked. Other `.md` docs and the operational scripts (`scripts/create-admin.ts`, `create-customer.ts`, `seed-content.ts`, …) are kept **local-only** (untracked) — they exist on disk but are not in the repo. The admin/customer create scripts read credentials from env vars (`ADMIN_USERNAME`/`ADMIN_PASSWORD`, etc.); usage is in the local `password.md`.

## Further reading

These docs are **local-only** (untracked, not in the repo) — present on the maintainer's checkout, absent from a fresh clone:

- `docs/technical-design.md` — full platform design.
- `docs/PROGRESS.md` — implementation history and known gaps.
- `docs/SECURITY_REMEDIATION.md` — what the `SEC-NN` markers mean.
- `LAUNCH_CHECKLIST.md` — pre-launch blockers and status.
