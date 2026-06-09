# Question Bank — Authoring Guide (题库编写指南)

`question-bank.json` is the single source of truth for all exam/practice questions. It is validated by the Zod schema in `docs/technical-design.md` §15 and loaded into the DB by the seed script.

## Current coverage (300 questions)

| Subject | Count | Mock quota (Basic / Adv) |
|---|---|---|
| Air Law | 87 | ~10 / ~14 |
| Flight Operations | 48 | ~6 / ~8 |
| Human Factors | 36 | ~4 / ~6 |
| Meteorology | 30 | ~4 / ~5 |
| Navigation | 27 | ~3 / ~5 |
| Airframes & Systems | 27 | ~4 / ~4 |
| Radiotelephony | 27 | ~3 / ~5 |
| Theory of Flight | 18 | ~2 / ~3 |

\* Pool ≈ 6× the larger (50-question Advanced) exam, so each generated mock is well varied.

**Eligibility note:** A question is eligible for an exam when its `certLevel` is the requested level **or** `BOTH`.
- **Basic:** 275 eligible → a full **35-question** Basic mock generates with large variety. ✓
- **Advanced:** 294 eligible → a full **50-question** Advanced mock generates with large variety. ✓

By cert level: 269 `BOTH`, 25 `ADVANCED`, 6 `BASIC`. (`BOTH` questions appear in both exams.)

**Free-tier preview:** FREE Basic users receive only `difficulty: 0` questions (`questionsForAccess`). The bank keeps 15 `difficulty: 0` Basic-eligible questions spanning all 8 modules, so the free preview is representative across topics while remaining a preview (not a full 35-question exam). Paid questions are `difficulty: 1..3`.

## Schema (per question)

```jsonc
{
  "id": "air-law-0001",          // ^[a-z-]+-\d{4}$, unique, stable
  "moduleId": "air-law",         // one of the 8 subject ids
  "certLevel": "BOTH",           // BASIC | ADVANCED | BOTH
  "type": "SINGLE",              // SINGLE | MULTI
  "selectCount": 1,              // SINGLE=1; MULTI=N (>=2)
  "difficulty": 1,               // 0..3; 0 marks a free question
  "stem":        { "EN": "...", "ZH": "..." },
  "options": [ { "id": "a", "label": { "EN": "...", "ZH": "..." }, "isCorrect": true }, ... ],
  "explanation": { "EN": "...", "ZH": "..." },
  "reference":   { "EN": "CAR 901.xx / RPAS 101 p.NN", "ZH": "CAR 901.xx / RPAS 101 p.NN" },
  "tags": ["registration", "weight"],

  // OPTIONAL — omit entirely for text-only questions
  "media": {
    "kind": "image",                                                   // image | video
    "url": "https://cdn.example.com/media/air-law/air-law-0001.png",   // absolute CDN/object-storage URL
    "alt": { "EN": "Class C airspace diagram", "ZH": "C 类空域示意图" } // bilingual alt / caption
  }
}
```

## Media (images / video)
Media is **referenced by URL**, never embedded in the JSON or stored as a DB blob.

- Files live in **object storage + CDN** (Cloudflare R2 / Vercel Blob / Supabase Storage). The
  question bank stores only the absolute `url`.
- Recommended path convention: `media/<moduleId>/<questionId>.<ext>`
  (e.g. `media/air-law/air-law-0001.png`).
- `media` is **optional** — text-only questions omit the field. `media.url` must be a valid
  absolute URL (Zod `z.string().url()`); `media.alt` is bilingual and required when `media` is set.
- The question bank JSON remains the version-controlled source of truth (git-reviewable,
  Zod-validated). Adding media to a question is a content edit, not a code change.

## Authoring rules
1. **Fully bilingual** — every `EN` and `ZH` field present and non-empty.
2. **Correct-count integrity** — `SINGLE`: exactly one `isCorrect`, `selectCount: 1`. `MULTI`: exactly `selectCount` correct options, `selectCount >= 2`.
3. **Cite a source** in `reference` (CAR number, Standard 921/922, RPAS 101 page, or TP-15263 area).
4. **Chinese terms** should be consistent across the bank. The current `ZH` fields may use English fallback text until a full human translation pass is completed.
5. **TC-style distractors** — plausible, non-trick; avoid "all of the above". Watch unit traps (400 ft AGL vs 400 ft ASL).
6. **Tag** every question for analytics and targeted practice.
7. **`id` is immutable** once shipped (exam sessions reference it); never renumber.
8. **Access tier marker** — `difficulty: 0` marks a free question. `difficulty: 1..3` marks paid questions by increasing difficulty.

## Workflow
```
edit content/question-bank.json
→ pnpm validate:bank   # Zod + correct-count + locale + glossary lint
→ pnpm seed            # upsert into DB
```

## Important
- Per CARs, do not copy or redistribute the **actual** Transport Canada exam questions. These items are original, written from public reference material (RPAS 101, CARs Part IX, TP-15263) for study only.
- `isCorrect` must **never** be serialized to the client during an exam — grading is server-side (see technical design §3, §8).
