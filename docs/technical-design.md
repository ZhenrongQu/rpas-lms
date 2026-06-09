# RPAS LMS — Technical Design

**Version:** 0.2
**Date:** 2026-06-07
**Status:** Implemented core exam/auth flow; LMS lessons remain planned
**Author:** Platform team

> Legal disclaimer: This platform is a study aid only. It is not affiliated with or endorsed by Transport Canada (TC) or NAV CANADA, and is not a legal authority. The Canadian Aviation Regulations (CARs) Part IX, TP 15263, and the TC-AIM are the authoritative sources.

## 1. Goals

RPAS LMS combines a lightweight study platform with a server-graded mock exam engine for Canadian RPAS pilot certification.

Current implemented scope:

- Basic and Advanced mock exam engine.
- EN/ZH UI and question-bank locale support.
- Guest-only intro module.
- Free registered access for selected Basic content.
- Paid-tier placeholder for full question-bank and Advanced access.
- Auth.js based registration/login using Google, Apple, email code, phone code, username, and verified legacy email/password login.
- Server-side grading, persisted exam sessions, result history, and post-submission review.

Planned LMS scope:

- MDX lesson catalog under `content/lessons/{en,zh}/{basic,advanced}/...`.
- Lesson progress, checkpoints, and course navigation.
- Payment/checkout flow to upgrade users to `PAID`.

## 2. Product Access Model

| User state | Access |
|---|---|
| Guest | Can view `/[locale]/intro` only. Cannot create exams. |
| Registered `FREE` user | Can access free learning content and Basic questions marked `difficulty: 0`. |
| `PAID` user | Can access the full question bank and Advanced content. |

Registered users are `FREE` by default. Payment is intentionally not implemented yet; `PAID` exists as an access tier in the data model and authorization rules.

## 3. Primary Flows

1. Guest opens `/en` or `/zh`.
2. Guest can open the intro module for company, service, and course introduction.
3. User registers or signs in with Google, Apple, email code, phone code, username, or verified legacy email/password.
4. `FREE` user starts a Basic mock exam using only free questions.
5. Client receives public question data only: no correct-answer flags, explanations, or references.
6. User answers questions. Confirmed answers can still be changed before submit.
7. User submits the exam.
8. Server grades the exam, persists the result, and returns score plus incorrect-answer review.
9. Results page shows score, pass/fail, per-module breakdown, and wrong-answer explanations.

## 4. Tech Stack

- **Next.js App Router** for pages and route handlers.
- **React + TypeScript** for UI and business logic.
- **next-intl** for route-based EN/ZH localization.
- **Auth.js / NextAuth v5** for sessions, OAuth, and credentials providers.
- **Prisma + SQLite** for local persistence.
- **Zod** for API and content validation.
- **bcryptjs** for password and verification-code hashing.
- **Vitest** for unit and route-handler tests.
- **Tailwind CSS + custom CSS** for the current HUD-style interface.

## 5. Information Architecture

The app uses the 8 TP-15263 knowledge areas as canonical modules:

| Module id | Subject |
|---|---|
| `air-law` | Air Law, Air Traffic Rules and Procedures |
| `airframes-systems` | RPAS Airframes, Power Plants, Propulsion and Systems |
| `human-factors` | Human Factors |
| `meteorology` | Meteorology |
| `navigation` | Navigation |
| `flight-operations` | Flight Operations |
| `theory-of-flight` | Theory of Flight |
| `radiotelephony` | Radiotelephony |

Questions are tagged by `moduleId`, `certLevel`, `type`, and `difficulty`.

## 6. Localization

Supported UI locales:

- `en`
- `zh`

Route locale examples:

- `/en`
- `/zh`

Question-bank localized fields use uppercase keys:

```ts
type Locale = "EN" | "ZH";
type LocalizedText = { EN: string; ZH: string };
```

Current implementation and new work should use EN/ZH.

## 7. Data Model

The implemented Prisma schema stores auth identities, verification codes, users, and exam sessions. The question bank remains file-backed JSON.

Key models:

```prisma
model User {
  id              String         @id @default(cuid())
  username        String?        @unique
  email           String?        @unique
  phone           String?        @unique
  displayName     String?        @map("name")
  hashedPassword  String?
  accessTier      String         @default("FREE")
  emailVerifiedAt DateTime?
  phoneVerifiedAt DateTime?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  identities      UserIdentity[]
  examSessions    ExamSession[]
}

model UserIdentity {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider          String
  providerAccountId String
  verifiedAt        DateTime?
  createdAt         DateTime @default(now())

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model VerificationCode {
  id         String    @id @default(cuid())
  target     String
  channel    String
  codeHash   String
  attempts   Int       @default(0)
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([target, channel])
}

model ExamSession {
  id           String   @id @default(cuid())
  userId       String?
  certLevel    String
  locale       String
  questionIds  String
  answers      String
  result       String?
  submittedAt  DateTime?
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  user         User?    @relation(fields: [userId], references: [id])
}
```

`UserIdentity` is the canonical link between a user and login methods such as Google, Apple, email, phone, and username. `VerificationCode` stores only hashed 6-digit codes.

## 8. Authentication Design

Supported login/registration methods:

- Google OAuth.
- Apple OAuth.
- Email 6-digit verification code.
- Phone/SMS 6-digit verification code.
- Username registration, allowed only after verifying email or phone.
- Legacy email/password credentials for existing local accounts.

Important rules:

- Verification codes are normalized by channel, hashed with bcrypt, expire after 10 minutes, and are one-time use.
- Requesting a new code consumes prior active codes for the same target/channel.
- Failed verification attempts are limited.
- Code-based Auth.js credentials login requires `channel`, `target`, and `code`; it must not log in using only a known email or phone.
- OAuth identities are linked to an existing verified email user when possible.
- Username identity is stored separately from email/phone/OAuth identities.

API routes:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/code/request` | Create and send a verification code. |
| `POST` | `/api/auth/code/verify` | Verify a code and create/reuse a free user. |
| `POST` | `/api/auth/register/username` | Register or assign a username after verified contact/session. |
| `GET` | `/api/auth/username/check` | Check username availability. |
| `POST` | `/api/auth/register` | Disabled legacy email/password self-registration endpoint. |
| `*` | `/api/auth/[...nextauth]` | Auth.js handlers. |

## 9. Exam Access Rules

Exam creation:

```ts
type AccessTier = "GUEST" | "FREE" | "PAID";
```

Rules:

- `GUEST` (anonymous, not logged in): can create a Basic taster only.
- `FREE` (registered, not yet purchased): can create Basic exams only.
- `PAID`: can create Basic and Advanced exams.

Question filtering (`questionsForAccess`) and exam size (`examQuestionCount`):

- `PAID`: all eligible questions (`certLevel` matches the requested level or `BOTH`); Basic = 35, Advanced = 50.
- `FREE`: Basic-eligible, `difficulty === 1`; a full **35**-question Basic exam.
- `GUEST`: Basic-eligible, `difficulty === 0`; a **10**-question Basic taster.

`difficulty: 0` is the anonymous-taster pool, `difficulty: 1` is the free registered-user pool, and `difficulty: 2..3` (plus all Advanced) are PAID-only.

## 10. Exam Engine

Generation:

1. Input: certification level, locale, optional user id/access tier.
2. Filter questions by certification level and access tier.
3. Draw a deterministic shuffled set based on seed/session.
4. Persist question ids and order in `ExamSession`.

Serving:

- `GET /api/exam/:id/questions` returns public question data only.
- Public question data includes stems, options, type, select count, module id, difficulty, and optional `media`.
- Public question data excludes `isCorrect`, explanation, and reference.
- **Option display order is shuffled deterministically per `(sessionId, questionId)`** (`src/lib/exam/optionOrder.ts`): a string hash seeds `mulberry32`, then Fisher–Yates reorders the options. The order is stable across re-fetches and identical in the post-submit review. Grading is unaffected because it compares option **ids** (`grade.ts`), never display order or letters. The A/B/C/D labels are assigned by render index, so shuffling the array reassigns letters automatically.

Answering:

- `POST /api/exam/:id/answer` upserts selected option ids.
- Users can change answers before final submit.

Submission:

- `POST /api/exam/:id/submit` grades server-side.
- Single-select is correct only when selected option equals the correct option.
- Multi-select is correct only when selected set exactly equals the correct set.
- Result includes score, pass/fail, per-module breakdown, and incorrect-review data.

Review:

- Post-submission review can expose correct answers, explanations, and references.
- Review is unavailable before submit.

## 11. API Surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/exam` | Create an exam session. |
| `GET` | `/api/exam/:id/questions` | Return public questions for a session. |
| `POST` | `/api/exam/:id/answer` | Save or update an answer. |
| `POST` | `/api/exam/:id/submit` | Grade and submit the exam. |
| `GET` | `/api/exam/:id/result` | Return a submitted result. |
| `GET` | `/api/exam/:id/review` | Return post-submission review. |

All grading endpoints must stay server-side and Zod-validate request bodies.

## 12. Question-Bank Schema

The bank is `content/question-bank.json` and is validated by Zod.

```ts
const Localized = z.object({ EN: z.string().min(1), ZH: z.string().min(1) });

const Option = z.object({
  id: z.string().min(1),
  label: Localized,
  isCorrect: z.boolean(),
});

const Media = z.object({
  kind: z.enum(["image", "video"]),
  url: z.string().url(),
  alt: Localized,
});

const QuestionSchema = z.object({
  id: z.string().regex(/^[a-z-]+-\d{4}$/),
  moduleId: z.enum(MODULE_IDS),
  certLevel: z.enum(["BASIC", "ADVANCED", "BOTH"]),
  type: z.enum(["SINGLE", "MULTI"]),
  selectCount: z.number().int().min(1),
  difficulty: z.number().int().min(0).max(3),
  stem: Localized,
  options: z.array(Option).min(2),
  explanation: Localized,
  reference: Localized,
  tags: z.array(z.string()),
  media: Media.optional(),
});
```

Authoring rules:

1. Every question has EN and ZH fields.
2. `SINGLE` has exactly one correct option and `selectCount: 1`.
3. `MULTI` has exactly `selectCount` correct options and `selectCount >= 2`.
4. `difficulty: 0` marks free questions.
5. References cite CARs, RPAS 101, Standard 921/922, TP-15263, or another authoritative source.
6. Correct answers must never be serialized before submission.

Media (optional, by URL — never a DB blob):

- `media` is optional; text-only questions omit it. When present, `media.url` is a valid absolute URL and `media.alt` is bilingual.
- Media files live in **object storage + CDN** (Cloudflare R2 / Vercel Blob / Supabase Storage). Recommended path convention: `media/<moduleId>/<questionId>.<ext>`.
- `media` carries no answer information, so it is safe to include in public question data and post-submit review.
- The question bank JSON stays the version-controlled source of truth; adding media is a content edit.

## 13. Security Boundaries

- Correct answers stay server-side until submit.
- Verification codes are hashed, time-limited, and consumed after success.
- Code login requires the code in the same Auth.js credentials authorization call.
- Guest users may create only a 10-question Basic taster (no Advanced, no paid-difficulty questions). Guest sessions are anonymous (no owner) and accessible by their unguessable session id; they carry no PII and are throwaway. Owned (logged-in) sessions still require the requesting user to match the session owner.
- Advanced/full-bank access requires `PAID`.
- Route handlers validate JSON payloads with Zod.
- Production email/SMS delivery should replace the current development delivery adapter without changing auth service semantics.

## 14. Local Database

Local development uses SQLite via Prisma.

- `prisma/dev.db`: local development database.
- `prisma/test.db`: Vitest database.

User information is stored in `User`; registered login identities are stored in `UserIdentity`; temporary verification codes are stored in `VerificationCode`.

### Production DB Migration (managed Postgres) — deferred

SQLite is fine for local dev and Vitest but does not survive serverless/multi-instance cloud
hosting (e.g. Vercel), where each instance has its own ephemeral filesystem. For production,
migrate the **runtime** database (users, sessions, progress) to managed **Postgres**
(Supabase / Neon / Vercel Postgres). Planned, not yet executed.

Migration steps when executed:

1. Set `datasource db { provider = "postgresql" }` in `prisma/schema.prisma`.
2. Point `DATABASE_URL` at the managed Postgres instance.
3. Run `prisma migrate` to create the schema on Postgres.
4. Re-run the seed to load the question bank into the new DB.
5. Verify exam create → answer → submit → review end-to-end against Postgres.

Scope note: only the runtime tables move to Postgres. The **authored question bank stays as
JSON in git** (the reviewable, Zod-validated source of truth) regardless of DB backend, and
**media stays in object storage + CDN** (URLs only in the bank) — never as DB blobs.

## 15. Testing Strategy

Current test coverage includes:

- Question-bank schema and loader tests.
- Exam generation, serialization, grading, scoring, review, access, and persistence tests.
- Auth account linking tests.
- Verification-code service tests.
- Auth/register route tests.
- Exam route-handler tests.

Expected pre-push verification:

```bash
pnpm test
pnpm typecheck
pnpm build
```

## 16. Roadmap

| Milestone | Scope |
|---|---|
| Auth and access | Implemented: OAuth, verification codes, username, FREE/PAID tiers. |
| Exam engine | Implemented: create, answer, submit, result, review. |
| EN/ZH content | In progress: question bank supports EN/ZH; lesson content planned. |
| LMS lessons | Planned: MDX catalog, lesson pages, progress, checkpoints. |
| Payment | Planned: checkout and access-tier upgrade to `PAID`. |
| Production delivery | Planned: real email/SMS providers behind `delivery.ts`. |
