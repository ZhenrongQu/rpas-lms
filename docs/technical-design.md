# DroneReady — Canadian RPAS Licence Study Platform
## Technical Design Document (技术设计文件)

**Version:** 0.1 (draft)
**Date:** 2026-06-05
**Status:** Design — pre-implementation
**Author:** Platform team

> **Legal disclaimer (must appear in product):** This platform is a study aid only. It is not affiliated with or endorsed by Transport Canada (TC) or NAV CANADA, and is **not** a legal authority. The Canadian Aviation Regulations (CARs) Part IX, TP 15263, and the TC-AIM are the authoritative sources. Content may become obsolete without notice.

---

## 1. Goals & Non-Goals

### 1.1 Goals
- A **lightweight LMS** (learning content + progress tracking) combined with an **exam question-bank engine** for Canadian RPAS pilot certification.
- Cover **both** certification streams:
  - **Basic Operations** — exam: 35 multiple-choice questions, 90 minutes, **65%** to pass.
  - **Advanced Operations** — exam: 50 multiple-choice questions, 60 minutes, **80%** to pass.
- Organize learning content into the **8 TP-15263 knowledge areas** (see §4).
- **Bilingual EN/FR** content, UI, questions, and explanations (Canada official languages; TC source material is bilingual).
- Realistic **exam simulator** that mirrors TC weighting and shows a **per-subject score breakdown** (the "12 of 14 / 2 of 2 …" results view).
- UI styled after the reference screenshot: left **course sidebar with per-lesson progress checkmarks**, header progress bar, clean main content pane, inline **"Apply Your Knowledge"** checkpoint questions.

### 1.2 Non-Goals (v1)
- No live flight-review scheduling, payments, or TC Drone Management Portal integration.
- No mobile native apps (responsive web only).
- No instructor/admin authoring web UI in v1 — content is authored as files in-repo (MDX + JSON) and seeded. (Admin UI is a roadmap item, §16.)
- No video hosting; embed external video by URL if needed.

---

## 2. Personas & Primary Flows

| Persona | Need |
|---|---|
| **New Basic candidate** | Study from zero, pass the 35-question Basic exam. |
| **Advancing pilot** | Already has Basic knowledge, wants Advanced (controlled airspace, ROC-A terminology, safety assurance). |
| **Recency learner** | Holds a certificate, needs to refresh every 24 months; wants targeted review + practice exam. |
| **Francophone candidate** | Same flows entirely in French. |

**Core flows**
1. **Onboard** → pick certification target (Basic / Advanced) and language (EN / FR).
2. **Learn** → work through modules; each lesson marks complete; inline checkpoint questions gate progress ("requires a correct answer to continue").
3. **Practice** → per-subject quizzes drawn from the question bank.
4. **Mock exam** → timed, weighted, full-length simulation; pass/fail + per-subject breakdown + review of wrong answers with explanations and source references.
5. **Track** → dashboard of module completion, exam history, weak subjects, recency timer.

---

## 3. Tech Stack & High-Level Architecture

**Stack**
- **Framework:** Next.js (App Router) + TypeScript. Single deployable, SSR for content SEO + API routes for the exam engine.
- **Styling:** Tailwind CSS + a small design-token layer (see §11). Headless UI / Radix for accessible primitives.
- **DB:** PostgreSQL (prod) / SQLite (local dev) via **Prisma** ORM.
- **Auth:** Auth.js (NextAuth) — email magic link + OAuth (Google) to start. Anonymous "guest" sessions supported via a local session id that can later be claimed by an account.
- **i18n:** `next-intl` for UI strings; content bilingualism handled in the data model (every translatable string stored per-locale). Locale in the route segment: `/[locale]/...`.
- **Content:** Lessons authored in **MDX** (rich content + custom components like `<Checkpoint>`); questions authored in **JSON** validated by a Zod schema (see §15 and the question bank file).
- **Validation:** Zod across API boundaries and content loading.
- **Testing:** Vitest (unit), Playwright (E2E exam flows).
- **Hosting:** Vercel or any Node host; Postgres via Neon/Supabase/RDS.

**Architecture (request lifecycle)**
```
Browser (RSC + client islands)
  │
  ├─ /[locale]/learn/...      → Server Components render MDX lessons; progress fetched server-side
  ├─ /[locale]/exam/...       → Client island runs the timed exam UI; talks to API routes
  │
  ▼
Next.js API routes (/api/*)   → Exam engine, scoring, progress writes — the ONLY place answers are graded
  │
  ▼
Prisma  ──►  PostgreSQL
```

**Security-critical rule:** Correct answers and grading **never** ship to the client during an exam. The client requests a question set by id; it submits selected option ids; the **server** grades. This prevents answer scraping (which also mirrors TC's "do not save or share exam questions" ethos).

---

## 4. Information Architecture — The 8 Knowledge Areas

Modules map 1:1 to TP-15263 subject areas (and to the exam result breakdown):

| Code | Subject (EN) | Subject (FR) | Basic | Advanced |
|---|---|---|---|---|
| `air-law` | 01 Air Law, Air Traffic Rules and Procedures | Droit aérien, règles et procédures de la circulation aérienne | ✓ | ✓ |
| `airframes-systems` | 02 RPAS Airframes, Power Plants, Propulsion and Systems | Cellules, groupes motopropulseurs, propulsion et systèmes des SATP | ✓ | ✓ |
| `human-factors` | 03 Human Factors | Facteurs humains | ✓ | ✓ |
| `meteorology` | 04 Meteorology | Météorologie | ✓ | ✓ |
| `navigation` | 05 Navigation | Navigation | ✓ | ✓ |
| `flight-operations` | 06 Flight Operations | Opérations de vol | ✓ | ✓ |
| `theory-of-flight` | 07 Theory of Flight | Théorie du vol | ✓ | ✓ |
| `radiotelephony` | 08 Radiotelephony | Radiotéléphonie | ✓ | ✓ |

> **Advanced depth:** Advanced adds controlled-airspace procedures, NAV CANADA authorization (NAV Drone), Safety Assurance (Standard 922), ROC-A / RIC-21 radio knowledge, transponders, and tighter human-factors/decision-making. Content is the same module tree; lessons and questions are tagged `certLevel: BASIC | ADVANCED | BOTH`.

Each **Module** → ordered **Lessons** → each Lesson may contain inline **Checkpoint** questions. The module also owns a pool of **Question**s used for practice quizzes and mock exams.

---

## 5. Feature Set

### 5.1 LMS
- Module → lesson navigation with a left sidebar; **completion checkmarks** per lesson; header **percent-complete** bar (matches screenshot).
- MDX lessons with callouts (Tip / Caution / Note), tables, images, and `<Checkpoint>` blocks.
- **Checkpoint gating:** a lesson checkpoint "requires a correct answer to continue" (configurable per checkpoint). Supports single-answer and **multi-select** ("select which **four** scenarios…").
- Resume where you left off; "next lesson" affordance.

### 5.2 Exam / Question-Bank Engine
- **Practice quiz:** choose a subject + length; instant feedback + explanation per question.
- **Mock exam:** full-length, **timed**, weighted by subject (see §8), no feedback until submission.
- **Scoring & breakdown:** pass/fail vs threshold; per-subject "x of y" table; list of incorrect questions with correct answer, explanation, and source reference.
- **Recency tools:** "recency check" practice exam; 24-month countdown on dashboard.
- **Question types:** `SINGLE` (one correct) and `MULTI` (select exactly N correct).

### 5.3 Accounts & Progress
- Guest mode (local) → claimable account.
- Persisted: lesson completion, checkpoint pass state, exam sessions/results, weak-subject stats, recency date.

---

## 6. Data Model (Prisma)

```prisma
// Enums
enum Locale          { EN FR }
enum CertLevel       { BASIC ADVANCED BOTH }
enum QuestionType    { SINGLE MULTI }
enum ExamKind        { PRACTICE MOCK CHECKPOINT RECENCY }
enum ExamStatus      { IN_PROGRESS SUBMITTED EXPIRED }

model User {
  id            String   @id @default(cuid())
  email         String?  @unique
  name          String?
  preferredLocale Locale @default(EN)
  certTarget    CertLevel @default(BASIC)
  recencyDate   DateTime?           // last recurrent activity; +24 months = due
  createdAt     DateTime @default(now())
  progress      LessonProgress[]
  examSessions  ExamSession[]
}

model Module {
  id        String  @id            // e.g. "air-law"
  order     Int
  // Translatable fields stored as locale->string JSON, validated by Zod
  title     Json                   // { "EN": "...", "FR": "..." }
  summary   Json
  lessons   Lesson[]
  questions Question[]
}

model Lesson {
  id        String  @id            // e.g. "air-law.registration"
  moduleId  String
  module    Module  @relation(fields: [moduleId], references: [id])
  order     Int
  certLevel CertLevel @default(BOTH)
  title     Json
  // MDX body is stored as files in-repo, referenced by slug; DB holds metadata only.
  mdxSlug   String                 // content/lessons/{locale}/{mdxSlug}.mdx
  estMinutes Int   @default(5)
  progress  LessonProgress[]
  @@index([moduleId, order])
}

model LessonProgress {
  id         String   @id @default(cuid())
  userId     String
  lessonId   String
  completed  Boolean  @default(false)
  completedAt DateTime?
  user       User     @relation(fields: [userId], references: [id])
  lesson     Lesson   @relation(fields: [lessonId], references: [id])
  @@unique([userId, lessonId])
}

model Question {
  id          String       @id            // stable slug, e.g. "air-law-0007"
  moduleId    String
  module      Module       @relation(fields: [moduleId], references: [id])
  certLevel   CertLevel                   // BASIC | ADVANCED | BOTH
  type        QuestionType                // SINGLE | MULTI
  selectCount Int          @default(1)    // for MULTI: how many correct must be chosen
  difficulty  Int          @default(2)    // 1..3
  stem        Json                        // { EN, FR }
  options     QuestionOption[]
  explanation Json                        // { EN, FR }
  reference   Json                        // { EN, FR } e.g. "CAR 901.xx / RPAS 101 p.34"
  tags        String[]                    // free-form, e.g. ["registration","sfoc"]
  active      Boolean      @default(true)
  @@index([moduleId, certLevel, active])
}

model QuestionOption {
  id         String   @id @default(cuid())
  questionId String
  question   Question @relation(fields: [questionId], references: [id])
  order      Int
  label      Json                          // { EN, FR }
  isCorrect  Boolean                       // NEVER serialized to client pre-grade
}

model ExamSession {
  id         String     @id @default(cuid())
  userId     String?                       // null for guests; resolved via guest token
  guestToken String?
  kind       ExamKind
  certLevel  CertLevel
  locale     Locale
  status     ExamStatus @default(IN_PROGRESS)
  startedAt  DateTime   @default(now())
  expiresAt  DateTime?                     // startedAt + time limit
  submittedAt DateTime?
  scorePct   Float?
  passed     Boolean?
  answers    ExamAnswer[]
  user       User?      @relation(fields: [userId], references: [id])
  @@index([userId, kind])
}

model ExamAnswer {
  id            String   @id @default(cuid())
  sessionId     String
  session       ExamSession @relation(fields: [sessionId], references: [id])
  questionId    String
  selectedOptionIds String[]               // graded server-side
  correct       Boolean?
  @@unique([sessionId, questionId])
}
```

**Why translatable fields as `Json {EN, FR}`:** keeps one row per logical entity (one Question, not two), simplifies "same question, two languages," and lets the API return only the requested locale. A Zod schema enforces both locales are present and non-empty at seed time.

---

## 7. Internationalization (EN/FR)

- **Route-based locale:** `/[locale]/...` with `next-intl`; `EN` default, `FR` available; locale switcher persists to `User.preferredLocale` / cookie.
- **UI strings:** `messages/en.json`, `messages/fr.json`.
- **Content strings:** stored per-locale in the DB JSON fields and in MDX files under `content/lessons/{en|fr}/...`.
- **Aviation terminology:** maintain a **bilingual glossary** (`content/glossary.json`) seeded from TP/CARs French equivalents (e.g. *aerodrome → aérodrome*, *bystander → passant*, *control zone → zone de contrôle*, *fly-away → dérive*, *NOTAM → avis aux navigants aériens*). The question-bank authoring guide requires FR terms match this glossary.
- **Numbers/units:** units (ft, NM, m, kg, °C, inHg, MHz) are identical across locales; only surrounding prose translates.

---

## 8. Exam Engine Logic

### 8.1 Generation (weighted, deterministic-per-session)
1. Input: `certLevel`, `kind`, `locale`.
2. Determine **total questions** and **time limit**:
   - Basic mock: 35 Q, 90 min, pass 65%.
   - Advanced mock: 50 Q, 60 min, pass 80%.
   - Practice: user-selected length (e.g. 10/20), no pass gate.
3. Determine **per-subject quota** from a weighting table (configurable). Example default weighting (sums to total; tuned to TP-15263 emphasis — Air Law and Flight Operations weighted heavily):

   | Subject | Basic share | Advanced share |
   |---|---|---|
   | Air Law | 30% | 28% |
   | Flight Operations | 16% | 16% |
   | Human Factors | 12% | 12% |
   | Meteorology | 10% | 10% |
   | Navigation | 8% | 10% |
   | Airframes & Systems | 10% | 8% |
   | Radiotelephony | 8% | 10% |
   | Theory of Flight | 6% | 6% |

   Quotas are computed by largest-remainder so they sum exactly to the total.
4. For each subject, randomly draw `quota` **active** questions where `certLevel ∈ {requested, BOTH}`. No duplicates within a session.
5. Persist the chosen question ids + order to the `ExamSession` (so refresh/resume is stable and the same exam can be reviewed).

### 8.2 Serving (no answers leak)
- `GET /api/exam/:sessionId/questions` returns stems + options **without** `isCorrect` and without explanations.
- Multi-select questions include `selectCount` so the UI can enforce "choose exactly N."

### 8.3 Grading (server-only)
- On submit (or on expiry), for each answer:
  - `SINGLE`: correct iff the single selected option is the correct one.
  - `MULTI`: correct iff the selected set **exactly equals** the correct set (no partial credit by default; partial credit is a config flag).
- `scorePct = correctCount / total`; `passed = scorePct >= threshold`.
- Compute **per-subject breakdown** (`x of y` per module) for the results view.
- For `MOCK` passes, optionally advance `User.recencyDate = now()` only for the dedicated RECENCY exam kind (writing the practice exam is a TC recency option).

### 8.4 Timing
- Server stamps `expiresAt = startedAt + limit`. Client shows a countdown but the **server** rejects/auto-grades late submissions (`status = EXPIRED`).

### 8.5 Review
- After submission, a review endpoint returns each question with the user's selection, correct option(s), explanation, and reference. (Only available post-submission.)

---

## 9. API Surface (Next.js Route Handlers)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/exam` | Create session (body: certLevel, kind, locale, length?) → returns sessionId, expiresAt |
| `GET` | `/api/exam/:id/questions` | Ordered questions for the session (no answers) |
| `POST` | `/api/exam/:id/answer` | Upsert a single answer (selectedOptionIds) |
| `POST` | `/api/exam/:id/submit` | Grade + return score, pass, breakdown |
| `GET` | `/api/exam/:id/review` | Post-submission review with explanations |
| `POST` | `/api/checkpoint/:questionId/check` | Grade an inline lesson checkpoint |
| `POST` | `/api/progress/lesson` | Mark lesson complete |
| `GET` | `/api/me/dashboard` | Completion %, exam history, weak subjects, recency status |

All grading endpoints are server-side; Zod-validate every body; rate-limit `answer`/`check`.

---

## 10. Content Authoring Pipeline

- **Lessons:** MDX files in `content/lessons/{en,fr}/{module}/{lesson}.mdx`. Frontmatter carries `id`, `moduleId`, `order`, `certLevel`, `title`, `estMinutes`. Custom MDX components: `<Tip>`, `<Caution>`, `<Note>`, `<Checkpoint questionId="..."/>`.
- **Questions:** a single source of truth `content/question-bank.json` (schema in §15). A seed script validates with Zod and upserts into the DB. Editing content = edit files + run `pnpm seed`.
- **Glossary:** `content/glossary.json` enforces FR term consistency (lint step in CI).
- **CI checks:** Zod-validate question bank (both locales present, `selectCount` matches number of `isCorrect` options for MULTI, exactly one correct for SINGLE, every `reference` non-empty), MDX builds, glossary lint.

---

## 11. UI / UX (matches reference screenshots)

**Design tokens**
- Header / sidebar: deep navy (`#0f2b3d`-ish) bar, white type, the screenshot's "course chrome."
- Body: light neutral background, white content card, generous line-height.
- Accent: a single brand accent for progress + primary buttons.
- Typography: humanist sans, large readable lesson text.

**Course layout (Learn)**
- **Left sidebar:** module title + "X% COMPLETE" bar at top; ordered lesson list; each completed lesson shows a **filled check circle**; current lesson highlighted; collapsible on mobile (hamburger as in screenshot).
- **Main pane:** lesson title bar, MDX content, inline `<Checkpoint>` cards ("Requires a correct answer to continue"), Prev/Next.
- **"Exit course"** affordance top-right.

**Mock exam UI**
- Timer, question N of M, palette of answered/flagged questions, single/multi selectors, Submit.
- **Results view:** big pass/fail, overall %, and the **per-subject table** ("01 Air Law … 12 of 14", "05 Navigation … 1 of 4") exactly like the second reference image, each subject row linking to review of its questions.

**Accessibility:** WCAG 2.1 AA — keyboard nav, focus states, color-contrast, `aria` on checkpoints/timer, prefers-reduced-motion.

---

## 12. Progress, Recency & Dashboard
- **Completion %** = completed lessons / total lessons for the chosen cert target.
- **Weak subjects** = lowest per-subject accuracy across recent mock exams; surfaced with a "practice this" CTA.
- **Recency** = if `recencyDate` set, show "current until `recencyDate + 24 months`"; warn at 60 days out. Document that passing a written exam, a flight review, an endorsed seminar, or a 921.04 recurrent program resets recency (informational only — we only auto-credit the in-app recency exam as a study milestone, not a legal record).

---

## 13. Non-Functional Requirements
- **Performance:** lessons are mostly static (RSC/SSG); exam interactions are small JSON calls. Target LCP < 2.5s.
- **Security:** answers server-side only; auth via Auth.js; CSRF-safe route handlers; rate limiting; no PII beyond email.
- **Privacy:** minimal data; export/delete account; clear privacy notice.
- **Reliability:** exam state persisted per answer so a refresh/disconnect never loses progress; server authoritative on timing.
- **Legal:** persistent disclaimer; "do not share exam questions" notice echoing CARs; cite that this is not a TC product.

---

## 14. Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Regulatory content drifts (CARs change) | Each question carries a `reference`; quarterly content review; `lastReviewed` metadata (roadmap). |
| French quality | Glossary lint + native review pass before publishing FR. |
| Answer scraping | Server-side grading; no `isCorrect` in client payloads. |
| Question bank too small for realistic exams | Track pool size per subject; CI warns if a subject pool < 3× its mock quota. |

---

## 15. Question-Bank Schema (authoritative spec)

The bank is one JSON document, `content/question-bank.json`, validated by this Zod schema:

```ts
import { z } from "zod";

const Localized = z.object({ EN: z.string().min(1), FR: z.string().min(1) });

const Option = z.object({
  id: z.string(),                 // unique within the question, e.g. "a","b","c","d"
  label: Localized,
  isCorrect: z.boolean(),
});

const Question = z.object({
  id: z.string().regex(/^[a-z-]+-\d{4}$/),  // "air-law-0007"
  moduleId: z.enum([
    "air-law","airframes-systems","human-factors","meteorology",
    "navigation","flight-operations","theory-of-flight","radiotelephony",
  ]),
  certLevel: z.enum(["BASIC","ADVANCED","BOTH"]),
  type: z.enum(["SINGLE","MULTI"]),
  selectCount: z.number().int().min(1),
  difficulty: z.number().int().min(1).max(3),
  stem: Localized,
  options: z.array(Option).min(2),
  explanation: Localized,
  reference: Localized,
  tags: z.array(z.string()),
}).refine(q =>
    q.type === "SINGLE"
      ? q.options.filter(o => o.isCorrect).length === 1 && q.selectCount === 1
      : q.options.filter(o => o.isCorrect).length === q.selectCount && q.selectCount >= 2,
  { message: "isCorrect count must match type/selectCount" });

export const QuestionBank = z.object({
  schemaVersion: z.literal(1),
  questions: z.array(Question),
});
```

**Authoring rules**
1. Every question is fully bilingual (EN + FR present and non-empty).
2. `SINGLE` → exactly one `isCorrect`. `MULTI` → exactly `selectCount` correct; `selectCount >= 2`.
3. `reference` cites a source (CAR number, Standard 921/922, RPAS 101 page, or TP-15263 area).
4. FR terms must match `content/glossary.json`.
5. Distractors must be plausible and non-trick (TC style); avoid "all of the above."
6. Tag with topical keywords for analytics and targeted practice.

See `content/question-bank.json` for the seeded bilingual bank covering all 8 subjects across Basic and Advanced.

---

## 16. Roadmap / Milestones

| Milestone | Scope |
|---|---|
| **M1 — Skeleton** | Next.js + i18n routing, design tokens, DB schema, seed pipeline, auth (guest + magic link). |
| **M2 — LMS** | Module/lesson rendering from MDX, sidebar + progress checkmarks, checkpoint gating (EN first, FR wired). |
| **M3 — Exam engine** | Session create/serve/grade APIs, weighting, timer, mock + practice, results breakdown view. |
| **M4 — Bilingual content** | Full EN+FR lessons + question bank loaded; glossary lint in CI. |
| **M5 — Dashboard & recency** | Completion %, weak subjects, exam history, recency timer. |
| **M6 — Polish** | A11y pass, performance, E2E tests for exam flows, legal/privacy. |
| **Post-v1** | Admin authoring UI, `lastReviewed` content governance, spaced-repetition review, analytics. |

---

## 17. Next Step

This design is ready to be turned into a **task-by-task implementation plan** (TDD, bite-sized steps) using the writing-plans workflow. The companion deliverable — the **bilingual question bank** — is in `content/question-bank.json` with the authoring guide in `content/question-bank-README.md`.
