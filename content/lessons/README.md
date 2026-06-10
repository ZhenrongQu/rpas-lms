# Lessons — Authoring Guide (课程编写指南)

Bilingual MDX lesson content for the two courses, grounded in **RPAS 101** and
**TP‑15263**. Design + rationale: `docs/superpowers/specs/2026-06-07-basic-advanced-lesson-content-design.md`;
knowledge map: `docs/superpowers/research/2026-06-07-tp-15263-knowledge-map.md`.

## Structure (level-first)

```
content/lessons/{en,zh}/{basic,advanced}/{moduleId}/{slug}.mdx
public/lessons/diagrams/*.svg          # shared, locale-independent diagrams
```

- `lessonId` = `` `${course}/${moduleId}/${slug}` `` (e.g. `basic/air-law/operating-limits`).
- EN and ZH trees are **structurally identical** — same set of `{course}/{module}/{slug}` paths.
- `moduleId` is one of the 8 canonical ids in `src/lib/content/types.ts`.

## Frontmatter

```yaml
---
title: "Operating Limits & No-Fly Zones"   # localized per file
order: 2                                     # sort within (course, module)
estMinutes: 8
certLevel: BASIC                             # BASIC | ADVANCED | BOTH
access: FREE                                 # FREE | PAID
---
```

**Access model** (mirrors `src/lib/exam/access.ts`): `basic/` lessons are
`access: FREE` + `certLevel: BASIC`; `advanced/` lessons are `access: PAID` +
`certLevel: ADVANCED`. Registered FREE users read Basic; PAID users read everything.

## Body conventions

- Markdown headings/lists/bold, plus four MDX components: `<Tip>`, `<Caution>`,
  `<Note>`, and **one or more** `<Checkpoint questionId="…" />` per lesson.
  Rules: no duplicate `questionId` within a lesson; EN and ZH must reference the
  **same set** of `questionId`s; all ids must be `ACTIVE` and from the **same module**.
- The checkpoint `questionId` **must** be a real id in the DB (or `content/question-bank.json`
  before seeding) from the **same module** — never invent ids.
- Diagrams are referenced with markdown images: `![alt](/lessons/diagrams/name.svg)`.
- End with `## Key takeaways` and a `Sources:` line (RPAS 101 page / CAR / Standard /
  TP‑15263 §). Original study content only — do **not** copy actual TC exam questions.
- ZH mirrors EN meaning and keeps key regulatory terms + numbers with the English in
  brackets on first use, e.g. 受控空域（controlled airspace）, 400 ft AGL.

## Current coverage (13 lessons × EN/ZH = 26 files)

**Basic (FREE):** air-law/getting-started · air-law/operating-limits ·
airframes-systems/systems-and-batteries · human-factors/fitness-and-decisions ·
meteorology/weather-basics · navigation/charts-and-flight-planning ·
flight-operations/site-survey-and-emergencies · theory-of-flight/how-rpas-fly.

**Advanced (PAID, delta — Basic is prerequisite):**
air-law/advanced-operating-environments · navigation/airspace-and-authorization ·
radiotelephony/aviation-communications · meteorology/advanced-weather ·
flight-operations/advanced-ops.

## Integration status

This content is **wired into the app** by the lessons feature
(`docs/superpowers/plans/2026-06-06-lms-lessons.md`, Plan 4) with the design spec §10
patches applied: locale `fr`→`zh`, the `{course}` path segment, and the `access`
frontmatter + `canViewLesson` gating. Lessons render at
`/{locale}/learn/{course}/{moduleId}/{slug}` (catalog loader: `src/lib/lessons/`,
pages: `app/[locale]/learn/`). Basic is open to all; Advanced requires a paid tier.

## Validate

A standalone check (no app build needed) confirms frontmatter, real checkpoint ids,
image refs, EN/ZH parity, and access/certLevel consistency — see the verification
snippet in the design spec §11.
