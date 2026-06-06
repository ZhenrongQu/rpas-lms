# Progress Log

---

# Plan 2 — Next.js App Shell + Drone HUD UI

**Last updated:** 2026-06-05
**Repo:** `/Users/quzhenrong/rpas-lms` (remote: `github.com/ZhenrongQu/rpas-lms`, private)
**Branch:** `nextjs-app-shell` (base branch: `main`)
**Plan:** `docs/superpowers/plans/2026-06-05-nextjs-app-shell.md` (9 tasks, TDD, subagent-driven)
**Status:** 🚧 **In progress — 3 / 9 tasks done.** Existing 44 engine tests still green; dev server compiles clean.

## Completed tasks (3 / 9)

| # | Task | Commit(s) | Notes |
|---|------|-----------|-------|
| 1 | Next.js 15 + Tailwind 3 + next-intl scaffold | `2073a83` | Removed `type:module`; configs added; 44 tests still pass |
| 2 | i18n routing + EN/FR messages + root/locale layouts | `fda2b63`, `3e1d55d` | `/en` + `/fr` render; fixup dropped dead `moduleId` key, fixed FR `results.correct` |
| 3 | HUD design tokens CSS + visual structure | `fc9a52c`, `7b64795` | 640-line stylesheet; fixup removed cyclic font-vars, bounded `.results-view`, `bg-scene` pointer-events |

Each task passed spec-compliance + code-quality review. Task 2 & 3 fixups applied controller-side from review findings.

## Remaining tasks (4–9)

- **Task 4:** Full HUD Header (drone logo, radar widget, nav tabs, EN/FR switcher)
- **Task 5:** Dashboard page (module grid, sidebar, progress ring, exam launcher)
- **Task 6:** ExamService additions + TDD — `getExpiresAt`/`getResult`/`getSessionMeta`, expiry enforcement in `answer()`, result storage in `submit()`, `GET /api/exam/[id]/result` (target: 48 tests)
- **Task 7:** Exam launch page (cert-level selector → POST /api/exam → redirect)
- **Task 8:** Exam question interface (timer, Q-manifest, answer/submit flow)
- **Task 9:** Results/debrief page (score ring, per-subject breakdown, weak-area highlight)

## How to resume / verify (Plan 2)
```bash
cd /Users/quzhenrong/rpas-lms
pnpm install      # if node_modules missing
pnpm test         # 44 passing now; 48 after Task 6
pnpm dev          # http://localhost:3000 → redirects to /en
```

## Execution constraint (user-set)
Update this file after every 2–3 completed tasks; **stop and update progress when usage reaches 95%.**

---

# Plan 1 — Exam Engine Core (complete)

**Last updated:** 2026-06-05
**Repo:** `/Users/quzhenrong/rpas-lms` (local only, **no remote** — never pushed)
**Branch:** `exam-engine-core` (base branch: `main`)
**Status:** ✅ **Plan 1 complete — all 12 tasks done.** 44 tests passing across 11 files; `pnpm typecheck` clean. Passed a final whole-implementation review (ready to merge).

## How to resume / verify
```bash
cd /Users/quzhenrong/rpas-lms
pnpm install      # if node_modules missing
pnpm test         # expect 44 passing, 11 files
pnpm typecheck    # clean
```
Plan: `docs/superpowers/plans/2026-06-05-exam-engine-core.md` (12 tasks, TDD, one commit per task).
Execution: Subagent-Driven Development — fresh implementer per task + two-stage review (spec compliance, then code quality), plus a final whole-implementation review.

## Completed tasks (12 / 12)

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Toolchain scaffold (TS + Vitest + Zod) | `127400d` | package.json, tsconfig.json, vitest.config.ts, src/lib/sanity.test.ts |
| 2 | Domain types | `ff0b2d6` | src/lib/content/types.ts |
| 3 | Zod schema + invariants | `2007881` | src/lib/content/schema.ts(.test) |
| 4 | Validated bank loader (real bank passes schema) | `ba1f1e0` | src/lib/content/loadBank.ts(.test) |
| 5 | Exam specs + largest-remainder quota allocation | `5cbaa6b` | src/lib/exam/config.ts, quota.ts(.test) |
| 6 | Seedable RNG + weighted generation w/ backfill | `7e0ca03` | src/lib/exam/rng.ts, generate.ts(.test) |
| 7 | Server-side grading (SINGLE + MULTI) | `0dd89f3` | src/lib/exam/grade.ts(.test) |
| 8 | Scoring + per-subject breakdown | `6111add` | src/lib/exam/score.ts(.test) |
| 9 | Session store interface + in-memory impl | `fe61b08` | src/lib/exam/store.ts(.test) |
| 10 | Public question serialization (strips answers) | `c321fa6` | src/lib/exam/serialize.ts(.test) |
| 11 | ExamService orchestration | `732bbfc` | src/lib/exam/service.ts(.test) |
| 12 | API route handlers (create/questions/answer/submit) | `fe16027` | src/lib/exam/instance.ts, app/api/exam/** |

Each task passed both spec-compliance and code-quality review. A progress-log commit (`1bbf3b5`) sits between tasks 9 and 10.

## Definition of Done — met
- `pnpm test` green (44), `pnpm typecheck` clean.
- Create a weighted Basic 35-Q mock → fetch public questions with **no `isCorrect`** leaked → submit → scored result with per-subject breakdown. Each step proven by a test (unit + integration + HTTP-handler level).
- All grading is server-side; in-memory store swappable behind `SessionStore`.

## Key decisions / honest gaps (carried forward to Plans 2–4)
- **Scope is Plan 1 only:** pure engine + route-handler-shaped functions, runnable under Vitest with no running Next.js server. Next.js app shell, i18n UI, Prisma persistence, auth, LMS lesson rendering, dashboard = **Plans 2–4**.
- **Persistence is in-memory** behind `SessionStore`; Prisma drops in later behind the same interface.
- **Grading is server-only**; `isCorrect` never serialized to clients (enforced by `toPublicQuestion`; asserted at unit, service, and route layers).
- **Advanced mock returns 48, not 50:** the seed bank has only 48 eligible (Advanced + BOTH) questions. Generator never repeats/invents → returns `min(total, eligiblePool)`. To reach a true 50-question Advanced mock, author ≥2 more `ADVANCED`/`BOTH` questions in `content/question-bank.json`. Content task, not a code bug (asserted in Task 6 test).
- **Basic air-law is under-quota by 2 (silent distribution skew):** the weight table allocates 11 air-law questions for a Basic mock, but only **9** BASIC-eligible air-law questions exist. The generator draws those 9 and backfills the remaining 2 from other subjects, so every Basic exam silently has 9 (not 11) air-law questions and 2 extra elsewhere. The exam is still a valid 35 questions — this only affects per-subject *distribution*, not totals. Fix cleanly by adding ≥2 more `BASIC`/`BOTH` air-law questions to the bank. (Found in final review.)
- **Exam expiry is set but NOT enforced server-side in Plan 1:** `expiresAt` is stored on the session and returned to the client, but `answer`/`submit` do not reject late calls. Server-authoritative timer enforcement is a Plan 2 concern (the exam UI shows the countdown; Plan 2/3 should add an `expiresAt < now` check in `answer`/`submit`).

## Housekeeping notes
- Repo created fresh (home dir was not a git repo). Design artifacts (technical-design.md, question bank, plan) committed on `main`, then branched.
- Removed two stray throwaway files (`test-json*.ts`) a reviewer left at repo root during Task 9.

## Suggested next steps (post-Plan-1)
1. Author ≥2 more `ADVANCED`/`BOTH` and ≥2 more `BASIC`/`BOTH` air-law questions to close the Advanced-50 and Basic-air-law-distribution gaps.
2. Begin **Plan 2**: Next.js app shell + i18n routing, mount these handlers as real routes, build the exam UI (timer, question palette, per-subject results table) and a `GET /api/exam/[id]/review` endpoint (post-submission explanations).
