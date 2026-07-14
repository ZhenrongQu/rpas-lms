# RPAS LMS

**English** | [中文](README.zh.md)

RPAS LMS is a Next.js-based learning and mock-exam platform for the Canadian RPAS / drone pilot certification. The current focus is the Basic Operations and Advanced Operations mock-exam experience: a bilingual EN/ZH UI, question-bank validation, server-side paper generation and grading, exam session persistence, account registration/login, exam history, a results page, and post-submission per-question review.

Course content (question bank, lessons, checkpoints) now lives in PostgreSQL and is managed through the `/coriander` admin CMS; UI copy still lives in locale message files; users, exam sessions, payments and entitlements are persisted via Prisma + PostgreSQL (Supabase).

The platform also ships two LLM-powered agents (see [`src/lib/agents/`](#srclibagents)): a paid AI study assistant with hybrid RAG retrieval over the course content, and an offline remediation (auto-fix) agent that turns reproducible test failures into human-reviewed patch proposals.

## Tech stack

- **Next.js App Router** — page routing and API routes.
- **React + TypeScript** — UI and application logic.
- **next-intl** — route-based EN/ZH internationalization.
- **Prisma + PostgreSQL (Supabase)** — data persistence (Postgres in both dev and prod).
- **Auth.js / NextAuth v5** — Google, Apple, and verification-code login, plus legacy password login for verified-email accounts; `Admin` and `Customer` are separate tables.
- **Stripe** — payments and entitlements for two products: paid_access (the Advanced bundle) and flight_review.
- **Cloudflare Stream** — lesson video upload and playback.
- **Resend** — email verification codes and flight-review booking notification emails.
- **Anthropic SDK** — the LLM behind the AI study assistant and the remediation agent's repairer (the app runs without `ANTHROPIC_API_KEY`; only those features are disabled).
- **Zod** — question-bank and API request-body validation.
- **Vitest** — unit tests and route-handler tests.
- **Tailwind CSS + custom CSS** — the drone HUD-style UI.

## Quick start

```bash
cd /Users/quzhenrong/rpas-lms
pnpm install
pnpm exec prisma db push
pnpm dev
```

Then open:

- `http://localhost:3000/en`
- `http://localhost:3000/zh`

Common commands:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm db:generate
pnpm db:push
```

## Environment variables

Create `.env` from `.env.example`:

```env
DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true&connection_limit=1"  # Supavisor pooler, runtime
DIRECT_URL="postgresql://...:5432/postgres"  # direct connection, prisma migrate / db push only
AUTH_SECRET="generate-with: openssl rand -base64 32"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
APPLE_CLIENT_ID=""
APPLE_CLIENT_SECRET=""
```

`DATABASE_URL` / `DIRECT_URL` point at the PostgreSQL (Supabase) database Prisma uses — Postgres in both dev and prod, with no SQLite path. See `.env.example` for the full set (including Stripe, Resend, Cloudflare Stream). `AUTH_SECRET` is the key Auth.js uses to sign session/JWT data. The Google and Apple variables are for OAuth login; when they are not configured locally you can still use the email/phone verification-code flow.
When the Google or Apple client id/secret is missing, the page disables the corresponding third-party login button to avoid redirecting to the provider's `invalid_request` page.

## Current user flow

1. A learner visits `/en` or `/zh`.
2. Guests can access `/[locale]/intro` to see the company intro, services, and course intro.
3. Users can log in with Google, Apple, or a local account. Local registration requires email, password, and an email verification code; login accepts email, phone, or username plus password.
4. Registered users are `FREE` by default and can start a Basic mock exam, but only with `difficulty: 0` free questions.
5. The full question bank and the Advanced mock exam are reserved for `PAID` users.
6. The client only receives public question data — never the correct answers.
7. The client submits the selected option ids per question.
8. After submission, the server grades and stores the result and returns review data for the missed questions.
9. The results page shows the score, pass/fail status, the per-subject breakdown, and explanations for all missed questions.
10. Logged-in users can see their submitted exams in the Mission Log.

Registered users are `FREE` by default. Free users can access free lessons and questions marked `difficulty: 0`; paid users can access the full question bank. Local users must verify email before password login.

## Project structure

```text
rpas-lms/
├── app/
│   ├── [locale]/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   ├── exam/
│   │   ├── intro/
│   │   ├── signin/
│   │   └── register/
│   ├── api/
│   │   ├── auth/
│   │   └── exam/
│   ├── globals.css
│   └── layout.tsx
├── content/
├── docs/
├── messages/
├── prisma/
├── src/
│   ├── components/
│   ├── i18n/
│   └── lib/
├── types/
├── auth.ts
├── middleware.ts
├── next.config.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

## Directory guide

### `app/`

The Next.js App Router pages directory.

- `app/layout.tsx` is the root HTML layout — loads fonts and global CSS.
- `app/[locale]/layout.tsx` is the localized page layout — wires up `NextIntlClientProvider`, the HUD background layer, and the top header.
- `app/[locale]/page.tsx` is the main dashboard page.
- `app/[locale]/intro/page.tsx` is the guest-accessible free intro module.
- `app/[locale]/exam/page.tsx` is the exam start page.
- `app/[locale]/exam/[id]/page.tsx` reads exam metadata on the server, then renders the client exam UI.
- `app/[locale]/exam/[id]/ExamClient.tsx` is the interactive timed exam interface.
- `app/[locale]/exam/[id]/results/page.tsx` shows the score and subject breakdown.
- `app/[locale]/exam/[id]/review/page.tsx` shows the post-submission per-question review.
- `app/[locale]/signin/page.tsx` and `app/[locale]/register/page.tsx` are the login/registration pages.
- `app/globals.css` contains the main HUD visual system and page layout styles.

### `app/api/`

The API route handlers the frontend calls.

- `app/api/auth/[...nextauth]/route.ts` exposes the Auth.js handlers.
- `app/api/auth/register/route.ts` is the deprecated legacy email/password registration entry; new registration must go through a verification code or OAuth.
- `app/api/auth/code/request/route.ts` requests an email/phone 6-digit verification code.
- `app/api/auth/code/verify/route.ts` verifies a code and creates or reuses a free user.
- `app/api/auth/register/username/route.ts` binds a username via a verified contact method or the current logged-in session.
- `app/api/auth/username/check/route.ts` checks whether a username is available.
- `app/api/exam/route.ts` creates a mock-exam session.
- `app/api/exam/[id]/questions/route.ts` returns the public questions for a session.
- `app/api/exam/[id]/answer/route.ts` saves the user's selected option ids.
- `app/api/exam/[id]/submit/route.ts` submits and grades the exam.
- `app/api/exam/[id]/result/route.ts` returns the saved result.
- `app/api/exam/[id]/review/route.ts` returns the post-submission per-question review data.
- The `*.test.ts` files in this directory test route-handler behavior without starting a server.

### `src/components/`

Reusable UI components.

- `auth/` — auth-related UI helpers, e.g. the sign-out button.
- `dashboard/` — dashboard cards, exam history, sidebar, and progress rings.
- `exam/` — exam UI components, e.g. question navigation, question cards, and the timer.
- `layout/` — the HUD header.
- `results/` — results-page components, e.g. the per-subject breakdown.

### `src/lib/exam/`

The exam engine — currently the most important business-logic directory.

- `config.ts` defines the question counts, time limits, pass marks, and subject weights for Basic/Advanced.
- `quota.ts` computes per-subject draw quotas from the weight table.
- `rng.ts` provides a reproducible seeded random.
- `generate.ts` selects eligible questions by certification level and generates a weighted paper.
- `grade.ts` decides whether the user's selected option ids exactly match the correct-answer set.
- `score.ts` produces the total score, pass/fail status, and per-subject breakdown.
- `serialize.ts` strips sensitive fields before questions are sent to the client.
- `review.ts` produces the post-submission per-question review, including correct answers and explanations.
- `store.ts` defines the `SessionStore` interface and an in-memory store for tests.
- `prismaStore.ts` persists exam sessions to PostgreSQL via Prisma.
- `service.ts` orchestrates the full exam lifecycle: create, fetch questions, answer, submit, result, review.
- `instance.ts` creates the app-wide shared `ExamService` instance.

### `src/lib/content/`

Question-bank domain model and validation logic.

- `types.ts` defines the modules, certification levels, question types, and question-bank TypeScript types.
- `schema.ts` uses Zod to validate the question bank and check invariants such as the correct-answer count.
- `loadBank.ts` loads the ACTIVE question bank for a certification level from the database.
- The `*.test.ts` files validate schema and loader behavior.

### `src/lib/auth/`

Authentication and account services.

- `password.ts` hashes and verifies passwords with `bcryptjs`.
- `types.ts` defines auth provider, verification-code channel, and access-tier types.
- `verificationCode.ts` generates, hashes, verifies, and consumes email/phone 6-digit codes, with a failed-attempt limit.
- `delivery.ts` abstracts the code-sending interface; in dev/test it logs to the console and can later be swapped for a real email or SMS service.
- `account.ts` creates/reuses email, phone, username, and OAuth users, and maintains `UserIdentity`.

### `src/lib/agents/`

The two LLM-powered agents, plus the small shared runtime they run on.

- `runtime.ts` is the shared agent loop: server-side tool execution, a step budget, per-call and cumulative token ceilings (a typed `BudgetExhausted` error), and a model-injection seam so unit tests run hermetically without an API key.

#### `agents/chat/` — paid AI study assistant

Backs `POST /api/chat` (paid users only; gating runs before any tokens are spent: 401 no session → 402 no paid access → 429 rate limit). The route streams plain text deltas; tools execute server-side and are never exposed to the client.

- `loop.ts` (`runAssistant`) drives the conversation on the shared runtime.
- `tools.ts` defines the tools the model may call (lesson lookup, progress, retrieval).
- `rag/` is hybrid retrieval over the course content: pgvector cosine search + weighted keyword search, fused with Reciprocal Rank Fusion (`retrieve.ts`), Voyage embeddings (`embed.ts`), and chunking/ingest (`chunk.ts`, `ingest.ts`) into the `KnowledgeChunk` table, scoped by locale and cert level.
- Offline eval: `scripts/eval/` (`pnpm eval:assistant`) scores fixed cases with deterministic checks plus an LLM judge — run it before/after any prompt or tool change.

#### `agents/remediation/` — offline remediation (auto-fix) agent

Turns a reproducible test failure into an auditable, human-reviewed patch proposal. The model authors the fix; every accept/reject decision is deterministic code.

- `state.ts` / `store.ts` — an explicit phase state machine persisted in Postgres with lease-based concurrency: every transition is a compare-and-swap conditioned on holding an unexpired lease, evidence is written atomically with the transition (crash-safe resume), and terminal phases release the lease.
- `reproduce.ts` / `worktree.ts` — reproduces the failure at a known commit in an isolated git worktree (twice, to reject flaky checks) and matches the failure signature against the incident before any repair starts.
- `repair.ts` / `llm/repairer.ts` — the restricted-capability repairer: a read allowlist, a single writable path, byte-bounded file and tool I/O, and a bounded, redacted trace of what the model actually did.
- `fixAttempt.ts` / `verify.ts` — gathers an evidence bundle (red-before, green-after, diff stats, patch) and verdicts it through ordered deterministic gates. A hidden holdout test is injected only after the patch is captured — the model can neither read nor modify it — and a hash of the visible check catches tampering.
- `publish.ts` — publishes the verified patch as an idempotent, append-only draft-PR proposal.
- Offline eval: `scripts/agents/repair-eval.ts` (`pnpm eval:repair`) runs the real model over a graded case catalog through this same pipeline; a case passes only by reaching its expected terminal state, with "no wrong proposal" reported as a hard safety line. It refuses to run against a non-local database.

### `src/lib/db.ts`

The Prisma client singleton. In development it caches the client on `globalThis` to avoid recreating database connections on every hot reload.

### `src/i18n/`

Internationalization configuration.

- `routing.ts` defines the supported locales: `en` and `zh`.
- `request.ts` wires `next-intl` into App Router request handling.

### `content/`

Content-related reference files (the question bank itself has been migrated to the database and is managed via the `/coriander` admin CMS — no longer JSON files).

- `question-bank-README.md` documents the question-authoring rules, schema, current coverage, and capacity gaps.
- `content/lessons/` keeps the initial lesson MDX seed material, imported into the database by `pnpm seed:content`.

Questions include bilingual stems, options, explanations, and references. Correct answers live in the database but are never sent to the client during an exam (see `serialize.ts`).

### `messages/`

UI translation copy.

- `en.json` holds the English UI copy.
- `zh.json` holds the Chinese UI copy.

These files drive buttons, labels, dashboard text, exam text, results text, and review text.

### `prisma/`

The database schema (PostgreSQL).

- `schema.prisma` defines identity (separate `Admin` / `Customer`, no shared role field), `UserIdentity`, `VerificationCode`, `RateLimit`, `ExamSession`, payments and entitlements (`Payment` / `Entitlement` / `WebhookEvent`), flight-review (`FlightReviewSlot` / `FlightReviewBooking`), the cert-level-split question banks (`Basic/AdvancedQuestionBank` + options), `CheckpointQuestion`, and lessons with progress (`Basic/AdvancedLesson` + `*LessonProgress`).

The question banks, lessons, and checkpoints are all database tables — no longer JSON files.

### `docs/`

Project notes, design, and history.

- `technical-design.md` is the fuller LMS + exam-platform technical design doc.
- `PROGRESS.md` records completed plans, implementation history, and known gaps.
- `ui-prototype.html` is an early static UI prototype.
- `docs/superpowers/` keeps the planning docs from previous implementation work.

### `types/`

Project-level TypeScript type extensions.

- `next-auth.d.ts` extends the NextAuth session/user types so `session.user.id` is available.

## Core concepts

### Guest session

Guests (not logged in) can only access the free intro module and cannot start an exam. Exam sessions now require login. Free registered users default to the `FREE` access tier and can use Basic questions marked `difficulty: 0`; the full question bank and the Advanced exam are reserved for the `PAID` tier.

### Registration and login

Supported registration/login methods:

- Google OAuth
- Apple OAuth
- Email 6-digit verification code
- Phone 6-digit verification code
- Username registration, where the username must be bound to a verified email or phone
- Legacy email/password login is retained for existing local accounts with a verified email

Verification codes are currently sent through the `delivery.ts` abstraction. Dev and test never connect to a real SMS/email provider — they only produce locally verifiable code records; replace this delivery layer when integrating a provider in production.

### Server-side grading boundary

During an exam, correct answers must stay on the server. When the frontend calls `/api/exam/[id]/questions`, it receives public question data produced by `serialize.ts`, which strips `isCorrect`, `explanation`, and `reference`.

Only after submission does the app reveal correct answers and explanations through the review logic.

### Exam Result vs. Exam Review

The Result is the score summary:

- Total questions
- Number correct
- Percentage
- Pass/fail
- Per-subject breakdown

The Review is the per-question explanation view. The submit endpoint returns the review for missed questions directly, and the results page also shows missed-question explanations directly; the full review page can still show every question:

- Stem
- The user's selected option ids
- The correct option ids
- All options and their correctness
- Explanation
- Reference

These two flows are intentionally kept separate in the current code.

## Testing

The project uses Vitest, collecting tests from both `src/` and `app/`.

```bash
pnpm test
```

Tests run against a real local Postgres (matching prod), not an in-memory DB. The default is `postgresql://postgres:postgres@localhost:5433/postgres`, overridable via `TEST_DATABASE_URL`. Spin up a disposable container:

```bash
docker run -d --name rpas-test-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 pgvector/pgvector:pg16
```

The `pgvector/pgvector` image (not stock `postgres:16`) is required: the RAG `KnowledgeChunk` table has a pgvector `vector` column, so `prisma db push` needs the `vector` extension available.

Config is in `vitest.config.mts`. `vitest.globalSetup.ts` resets and `db push`es the schema before the suite. All test files share one database, so they run sequentially (`fileParallelism: false`).

## Known gaps

- The Advanced mock exam may have fewer eligible questions than the configured target. See `content/question-bank-README.md`.
- Payments are integrated with Stripe (`paid_access` / `flight_review` products); entitlements are the source of truth via the `Entitlement` table, with `Customer.accessTier` as a denormalized cache.
- Exam answers are currently stored as JSON on `ExamSession`, not as separate `ExamAnswer` rows.

## Recommended reading order

To understand the project fastest, read in this order:

1. `app/[locale]/exam/page.tsx` — how an exam starts.
2. `app/api/exam/route.ts` — how a session is created.
3. `src/lib/exam/service.ts` — the exam lifecycle.
4. `src/lib/exam/serialize.ts`, `score.ts`, and `review.ts` — the security boundary.
5. `prisma/schema.prisma` — what data is persisted.
6. `content/question-bank-README.md` — read before editing questions.

## Local / dev test accounts

Test accounts and passwords are not kept in the repo. Credentials live in the local `password.md` (untracked, ignored by `.gitignore`).

Rebuild or change passwords with the scripts (scripts live locally under `scripts/`, defaulting to the `.env` dev database):

```bash
# Admin → Admin table, login at /coriander
ADMIN_USERNAME=<user> ADMIN_PASSWORD='<password>' ADMIN_EMAIL=<email> pnpm exec tsx scripts/create-admin.ts

# Customer → Customer table (CUSTOMER_TIER may be FREE/PAID)
CUSTOMER_EMAIL=<email> CUSTOMER_PASSWORD='<password>' CUSTOMER_USERNAME=<user> CUSTOMER_TIER=PAID pnpm exec tsx scripts/create-customer.ts
```
