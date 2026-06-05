# Progress Log — Exam Engine Core (Plan 1)

**Last updated:** 2026-06-05
**Repo:** `/Users/quzhenrong/rpas-lms` (local only, **no remote** — never pushed)
**Branch:** `exam-engine-core` (base branch: `main`)
**Test/typecheck state:** 32 tests passing across 8 files; `pnpm typecheck` clean.

## How to resume
```bash
cd /Users/quzhenrong/rpas-lms
pnpm install      # if node_modules missing
pnpm test         # expect all green
pnpm typecheck
```
Plan being executed: `docs/superpowers/plans/2026-06-05-exam-engine-core.md` (12 tasks, TDD, one commit per task).
Execution method: Subagent-Driven Development — fresh implementer per task + two-stage review (spec compliance, then code quality).

## Completed tasks (9 / 12)

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

All 9 passed both spec-compliance and code-quality review.

## Remaining tasks (3 / 12)
- **Task 10** — Public question serialization (`src/lib/exam/serialize.ts`): strips `isCorrect`/explanation/reference so answers never reach the client. *(in progress)*
- **Task 11** — `ExamService` orchestration (`src/lib/exam/service.ts`): create/serve/answer/submit, ties store + generation + grading + config.
- **Task 12** — API route handlers under `app/api/exam/**` (web-standard `Request → Response`) + `src/lib/exam/instance.ts` singleton.

After Task 12: dispatch a final whole-implementation review, then finish the branch.

## Key decisions / honest gaps (carried from the plan)
- **Scope is Plan 1 only:** pure engine + route-handler-shaped functions, runnable under Vitest with no running Next.js server. Next.js app shell, i18n UI, Prisma persistence, auth, LMS lesson rendering, dashboard = **Plans 2–4**.
- **Persistence is in-memory** behind `SessionStore`; Prisma drops in later behind the same interface.
- **Grading is server-only**; `isCorrect` must never be serialized to clients (Task 10 enforces this; Task 12 test asserts it).
- **Advanced mock returns 48, not 50:** the seed bank has only 48 eligible (Advanced + BOTH) questions. Generator never repeats/invents → returns `min(total, eligiblePool)`. To reach a true 50-question Advanced mock, author ≥2 more `ADVANCED`/`BOTH` questions in `content/question-bank.json`. This is a content task, not a code bug (asserted in Task 6 test).

## Housekeeping notes
- Repo created fresh (home dir was not a git repo). Design artifacts (technical-design.md, question bank, plan) committed on `main`, then branched.
- Removed two stray throwaway files (`test-json*.ts`) a reviewer left at repo root during Task 9.
