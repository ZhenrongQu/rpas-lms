# Design — Basic & Advanced RPAS Lesson Content (bilingual MDX)

> Status: **approved; blueprint finalized after TP‑15263 research** · Date: 2026-06-07
> Companion to (not a replacement for) `docs/superpowers/plans/2026-06-06-lms-lessons.md` (Plan 4).
> Knowledge map: `docs/superpowers/research/2026-06-07-tp-15263-knowledge-map.md`.

## 1. Goal

Author two **levels** of bilingual (EN + ZH) MDX lesson content for the RPAS LMS,
grounded in **RPAS 101** and **TP‑15263 (Knowledge Requirements, TP 15263)**:

- **Basic Operations** course — foundational knowledge for the Basic operating
  environment. **Free** to registered users.
- **Advanced Operations** course — the higher‑risk *delta* (controlled airspace,
  operations near/over people, aviation communications, safety assurance, advanced
  meteorology). **Paid.**

Each level is **concise** ("精简") but covers all **8 knowledge areas / modules**,
emphasizing the things that matter most for safety and the exam: **operating
limits, safety, emergencies, and key numbers**.

## 2. Scope & non‑goals

**In scope (this task):**
- MDX lesson files for both courses, fully mirrored **EN + ZH**.
- Supporting **SVG diagrams** (dark HUD style) where a picture beats prose.
- A short **patch note** to Plan 4 so the lessons feature, when built, picks up the
  new `{course}` path segment, the `zh` locale, and lesson access‑gating.

**Non‑goals (explicitly NOT built here):**
- The Plan 4 rendering feature itself (catalog loader, MDX components, checkpoint
  API, lesson pages, dashboard wiring). That remains Plan 4's job. The content
  authored here is structured to drop into it.
- Any payment/checkout flow (the `PAID` tier already exists as a field).

## 3. Access model (maps to existing tiers)

The repo already gates exactly this way (`src/lib/exam/access.ts`,
`AccessTier = "FREE" | "PAID"`, `prisma … accessTier @default("FREE")`):

| Course folder | Lesson `access` | Who can read |
|---|---|---|
| `basic/` | `FREE` | Registered users (FREE and PAID) |
| `advanced/` | `PAID` | PAID users only |

Mirrors `canCreateExam` (FREE → Basic only; PAID → everything). Guests: a limited
preview is consistent with the existing free `intro` module, but **guest policy is a
render‑layer decision for Plan 4**, not a content decision here.

## 4. Folder structure & naming (Approach 1: level‑first)

```
content/lessons/{en,zh}/{basic,advanced}/{moduleId}/{slug}.mdx
public/lessons/diagrams/{name}.svg          # shared bilingual SVG diagrams
```

- `lessonId` (locale‑independent) = `` `${course}/${moduleId}/${slug}` `` — e.g.
  `basic/air-law/operating-limits`. Extends Plan 4's `${moduleId}/${slug}`.
- Route shape (Plan 4, once patched): `/{locale}/learn/{course}/{moduleId}/{slug}`.
- `moduleId` ∈ the 8 canonical ids: `air-law`, `airframes-systems`,
  `human-factors`, `meteorology`, `navigation`, `flight-operations`,
  `theory-of-flight`, `radiotelephony`.
- EN and ZH trees are **structurally identical** (same course/module/slug paths).

## 5. Frontmatter schema (extends Plan 4)

```yaml
---
title: "Operating Limits & No‑Fly Zones"   # localized per file
order: 2                                     # sort within (course, module)
estMinutes: 7
certLevel: BASIC                             # BASIC | ADVANCED | BOTH
access: FREE                                 # FREE | PAID  ← NEW field
---
```

`access` is the only addition to Plan 4's frontmatter. Default by folder
(`basic/` → FREE, `advanced/` → PAID) but written explicitly in every file so
gating is self‑documenting.

## 6. Lesson blueprint (finalized against TP‑15263)

The 8 TP‑15263 sections **are** the 8 modules. Split below follows the official
Basic‑vs‑Advanced boundary (see research note).

### Basic Operations (`basic/`, `access: FREE`, `certLevel: BASIC`) — 8 lessons

| # | `moduleId/slug` | Key points (limits · safety · numbers) |
|---|---|---|
| 1 | `air-law/getting-started` | What needs a pilot cert & registration (RPA 250 g–25 kg → register + mark before first flight); Basic vs Advanced certificate; CARs Part IX structure; docs required on‑site + recency (24 mo); privacy/trespass/Criminal Code; enforcement & fines ($5k/$25k); incident reporting — TC (CAR 901.49) & TSB. |
| 2 | `air-law/operating-limits` | Basic ops limits (Part IX Subpart 1 Div IV): **≤400 ft·122 m AGL**; **VLOS**; **≥30 m from bystanders, never over them**; **3 NM airports / 1 NM heliports**; **not in controlled airspace**; day/night (position lights); 3 NM military; SFOC triggers. *(core "限制" lesson + diagram)* |
| 3 | `airframes-systems/systems-and-batteries` | Components (flight controller/ESC, IMU, GNSS, compass, barometer/altimeter); data links & interference; **LiPo battery hazards + cold weather + transport**; autopilot & flight‑termination; maintenance & logs; pre‑flight inspection. |
| 4 | `human-factors/fitness-and-decisions` | **IM SAFE**; alcohol (12 h) · cannabis (28 d) · fatigue; hazardous attitudes; CRM/communication; decision‑making, SA, automation complacency. *(IM SAFE card diagram)* |
| 5 | `meteorology/weather-basics` | Atmosphere & pressure; altimetry; wind & gusts; turbulence; clouds; fog/surface layers; **icing (no de‑ice → don't fly)**; METAR/AWOS & weather services; brief **thunderstorm avoidance (~15 NM)**. |
| 6 | `navigation/charts-and-flight-planning` | Definitions (lat/long, track/heading, variation, drift); **AGL vs ASL · NM/SM**; VNC/VTA charts & CFS; 24‑hr/UTC time; compass variation/calibration; flight planning (NOTAMs, W&B, docs, wind); basic **radio theory** (bands, interference, RF assessment). |
| 7 | `flight-operations/site-survey-and-emergencies` | PIC responsibilities; **site survey** (remote + on‑site); SOPs (normal + emergency); crew brief; **emergencies — lost link · fly‑away · flight termination · RTH gotchas · battery failure · loss of VLOS**; occupational safety. *(emergency decision‑flow diagram)* |
| 8 | `theory-of-flight/how-rpas-fly` | Lift (Bernoulli/Newton); four forces; aerofoil, AoA, stall; stability; multirotor vs fixed‑wing vs helicopter dynamics; props/rotors; load factor. |

### Advanced Operations (`advanced/`, `access: PAID`, `certLevel: ADVANCED`) — 5 lessons (delta; Basic = prerequisite)

| # | `moduleId/slug` | Key points |
|---|---|---|
| 1 | `air-law/advanced-operating-environments` | Advanced environments (Div V): **controlled airspace**; within **3 NM airport / 1 NM heliport**; **near people 5–30 m** & **over people <5 m** with an approved RPAS; **Safety Assurance / Standard 922**; SFOC scope. *(near/over‑people zones diagram)* |
| 2 | `navigation/airspace-and-authorization` | **Airspace classes A–G**; control zones (3000 ft AAE); Class F (CYA/CYR/CYD); **NAV CANADA / NAV Drone authorization** workflow; **GNSS/DGPS** depth & signal loss; **ATC transponder**; sharing airspace / give way. *(airspace‑ladder diagram)* |
| 3 | `radiotelephony/aviation-communications` | **ROC‑A** (knowledge essential for Advanced); VHF; MF/ATF; ATC services; blind‑broadcast script; **126.7 / 123.2 / 121.5**; phonetic alphabet; ACC emergency contacts. |
| 4 | `meteorology/advanced-weather` | Advanced‑only met: **moisture & lapse rate**; **stability/instability**; **fronts & frontal weather**; **thunderstorm development & hazards** (microbursts, wind shear); **TAF** interpretation. |
| 5 | `flight-operations/advanced-ops` | **EVLOS** & **sheltered operations**; higher‑risk site survey & ops near people; the **Flight Review** (practical assessment) overview; staying current. |

Total: **13 lessons × 2 languages = 26 MDX files** + **5 SVG diagrams**.

## 7. Per‑lesson authoring template

- Frontmatter (§5).
- Short intro (1–2 sentences) → `## sections` with **bulleted limits/numbers** (not walls of text).
- 1–3 callouts: `<Tip>` (good practice), `<Caution>` (safety/legal hazard), `<Note>` (clarification).
- **One** `<Checkpoint questionId="…" />` referencing a **real** question id from the
  same module (e.g. `air-law-0001`, `meteorology-0001`, …). Validated by a script
  (Plan 4 Task 10 already defines this check) — never invent ids.
- `## Key takeaways` — 3–5 bullets.
- A `Sources` line citing **RPAS 101 p.NN / CAR 901.xx / Standard 921‑922 / TP‑15263 §N**,
  matching the question bank's `reference` convention.
- EN and ZH say the **same things**; ZH keeps key regulatory terms + numbers with the
  English in brackets on first use, e.g. 受控空域（controlled airspace）, 400 英尺 AGL.

## 8. Diagrams (SVG, dark HUD theme, shared across locales)

Stored in `public/lessons/diagrams/`, referenced from MDX via
`![alt](/lessons/diagrams/name.svg)`. Labels kept short/bilingual or numeric so one
asset serves both locales.

| File | Used in | Shows |
|---|---|---|
| `basic-operating-limits.svg` | basic/air-law/operating-limits | 400 ft·122 m ceiling, 30 m bystander ring, 3 NM airport / 1 NM heliport, VLOS cone |
| `emergency-decision-flow.svg` | basic/flight-operations/site-survey-and-emergencies | lost link → troubleshoot → hover / RTH / flight‑termination |
| `im-safe.svg` | basic/human-factors/fitness-and-decisions | I‑M‑S‑A‑F‑E checklist card |
| `airspace-classes.svg` | advanced/navigation/airspace-and-authorization | A–G ladder w/ 18,000 / 12,500 / 3000 ft AAE / G<400 ft |
| `people-distance-zones.svg` | advanced/air-law/advanced-operating-environments | >30 m basic, 5–30 m & <5 m advanced (approved RPAS + Std 922) |

Generation: the dark‑themed SVG diagram skill (matches the app's HUD palette;
text‑based + version‑friendly).

## 9. Sourcing & research

- Primary: **RPAS 101** (provided PDF) — page‑cited; the tie‑breaker on specifics.
- Authoritative knowledge map: **DONE** — see
  `docs/superpowers/research/2026-06-07-tp-15263-knowledge-map.md`. Confirmed the 8
  sections map to the 8 modules and locked the Basic‑vs‑Advanced boundary (incl. the
  ROC‑A reconciliation: full radiotelephony → Advanced).
- Per the bank README: do **not** reproduce actual TC exam questions — original study
  content only.

## 10. Plan 4 integration — patch notes (for when the lessons feature is built)

1. **Locale `fr` → `zh`** throughout Plan 4 (paths `content/lessons/zh/…`,
   `messages/zh.json`, route locale `zh`, parity checks). The app's locales are `en`/`zh`.
2. **Add `{course}` path segment:** loader signatures + `lessonId`/route become
   `{course}/{moduleId}/{slug}`; module landing/sidebar scoped to a course.
3. **Add `access` to** `FrontmatterSchema` + `LessonMeta`.
4. **Add lesson gating** `canViewLesson(tier, access)` mirroring `canCreateExam`
   (PAID → any; FREE → `access === "FREE"`; guest preview = Plan 4 policy); the lesson
   page enforces it for `advanced/` lessons.
5. **Dashboard/progress** accounts for two courses.

## 11. Verification (definition of done for the content)

- Every `<Checkpoint questionId>` exists in `content/question-bank.json` (id‑check script).
- EN/ZH trees identical (same set of `{course}/{moduleId}/{slug}` paths); no missing locale.
- Every frontmatter block parses and has all 5 fields with valid enums.
- All 5 diagrams render and are referenced by at least one lesson.
- Every lesson cites at least one source (RPAS 101 / CAR / Standard / TP‑15263).
- Spot‑check numbers against RPAS 101 (400 ft AGL, 30 m, 3 NM/1 NM, 15 NM, 12 h/28 d, etc.).
