# Exam / Question-Bank Engine — Implementation Plan (Plan 1 of series)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the testable core of the RPAS question-bank engine — validated bank loading, weighted exam generation, server-only grading, scoring with per-subject breakdown, a session store, and route-handler-shaped API functions — all runnable under Vitest with no running server.

**Architecture:** Pure TypeScript domain modules under `src/lib/`, consumed by web-standard `Request → Response` handlers placed at `app/api/...` (so they become real Next.js App Router routes in Plan 2 without changes). Grading is server-only; `isCorrect` is never serialized to clients. Sessions use an injectable `SessionStore` (in-memory now; Prisma drops in later behind the same interface).

**Tech Stack:** TypeScript, Vitest, Zod. (Next.js, Tailwind, Prisma/Postgres, Auth.js, i18n UI are **Plan 2+** — handlers here use only web-standard `Request`/`Response`, so this plan needs no Next runtime to test.)

**Plan series (context, not part of this plan):**
- **Plan 1 (this):** Exam/question-bank engine core.
- **Plan 2:** Next.js app shell, i18n routing, design tokens, mount these handlers as real routes, exam UI + results breakdown view.
- **Plan 3:** Prisma persistence (swap `InMemorySessionStore`), auth, progress.
- **Plan 4:** MDX LMS lessons + checkpoint gating; dashboard & recency.

**Scope note on the seed bank:** Basic mock (35) fills from 44 eligible questions ✓. Advanced mock (50) currently has 48 eligible, so the generator returns 48 until ≥2 more Advanced/BOTH questions are authored. The generator **never repeats or invents** questions; Task 6 tests assert this exact behavior.

**Prerequisites:** `content/question-bank.json` exists at the project root (already authored and validated).

---

### Task 1: Project scaffold (TypeScript + Vitest + Zod)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/lib/sanity.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "rpas-lms",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "app", "content"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create `src/lib/sanity.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Install and run the sanity test**

Run: `pnpm install && pnpm test`
Expected: 1 passing test (`toolchain > runs vitest`).

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src/lib/sanity.test.ts pnpm-lock.yaml
git commit -m "chore: scaffold TypeScript + Vitest + Zod toolchain"
```

---

### Task 2: Domain types

**Files:**
- Create: `src/lib/content/types.ts`

- [ ] **Step 1: Create `src/lib/content/types.ts`**

```ts
export type Locale = "EN" | "FR";
export type CertLevel = "BASIC" | "ADVANCED" | "BOTH";
export type ExamCertLevel = "BASIC" | "ADVANCED";
export type QuestionType = "SINGLE" | "MULTI";

export const MODULE_IDS = [
  "air-law",
  "airframes-systems",
  "human-factors",
  "meteorology",
  "navigation",
  "flight-operations",
  "theory-of-flight",
  "radiotelephony",
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export interface Localized {
  EN: string;
  FR: string;
}

export interface QuestionOption {
  id: string;
  label: Localized;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  moduleId: ModuleId;
  certLevel: CertLevel;
  type: QuestionType;
  selectCount: number;
  difficulty: number;
  stem: Localized;
  options: QuestionOption[];
  explanation: Localized;
  reference: Localized;
  tags: string[];
}

export interface QuestionBank {
  schemaVersion: 1;
  questions: Question[];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/content/types.ts
git commit -m "feat: add question-bank domain types"
```

---

### Task 3: Zod schema with correct-count & uniqueness invariants

**Files:**
- Create: `src/lib/content/schema.ts`
- Test: `src/lib/content/schema.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/content/schema.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { QuestionSchema, QuestionBankSchema } from "./schema";

const validSingle = {
  id: "air-law-0001",
  moduleId: "air-law",
  certLevel: "BOTH",
  type: "SINGLE",
  selectCount: 1,
  difficulty: 1,
  stem: { EN: "Q?", FR: "Q?" },
  options: [
    { id: "a", label: { EN: "A", FR: "A" }, isCorrect: true },
    { id: "b", label: { EN: "B", FR: "B" }, isCorrect: false },
  ],
  explanation: { EN: "e", FR: "e" },
  reference: { EN: "r", FR: "r" },
  tags: ["x"],
};

describe("QuestionSchema", () => {
  it("accepts a valid SINGLE question", () => {
    expect(QuestionSchema.safeParse(validSingle).success).toBe(true);
  });

  it("rejects SINGLE with two correct options", () => {
    const bad = {
      ...validSingle,
      options: [
        { id: "a", label: { EN: "A", FR: "A" }, isCorrect: true },
        { id: "b", label: { EN: "B", FR: "B" }, isCorrect: true },
      ],
    };
    expect(QuestionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects MULTI whose correct count != selectCount", () => {
    const bad = {
      ...validSingle,
      type: "MULTI",
      selectCount: 3,
      options: [
        { id: "a", label: { EN: "A", FR: "A" }, isCorrect: true },
        { id: "b", label: { EN: "B", FR: "B" }, isCorrect: true },
        { id: "c", label: { EN: "C", FR: "C" }, isCorrect: false },
      ],
    };
    expect(QuestionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing FR locale", () => {
    const bad = { ...validSingle, stem: { EN: "only en", FR: "" } };
    expect(QuestionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate option ids", () => {
    const bad = {
      ...validSingle,
      options: [
        { id: "a", label: { EN: "A", FR: "A" }, isCorrect: true },
        { id: "a", label: { EN: "B", FR: "B" }, isCorrect: false },
      ],
    };
    expect(QuestionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("QuestionBankSchema", () => {
  it("rejects duplicate question ids", () => {
    const bank = { schemaVersion: 1, questions: [validSingle, validSingle] };
    expect(QuestionBankSchema.safeParse(bank).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/content/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Create `src/lib/content/schema.ts`**

```ts
import { z } from "zod";
import { MODULE_IDS } from "./types";

const Localized = z.object({ EN: z.string().min(1), FR: z.string().min(1) });

const Option = z.object({
  id: z.string().min(1),
  label: Localized,
  isCorrect: z.boolean(),
});

export const QuestionSchema = z
  .object({
    id: z.string().regex(/^[a-z-]+-\d{4}$/),
    moduleId: z.enum(MODULE_IDS),
    certLevel: z.enum(["BASIC", "ADVANCED", "BOTH"]),
    type: z.enum(["SINGLE", "MULTI"]),
    selectCount: z.number().int().min(1),
    difficulty: z.number().int().min(1).max(3),
    stem: Localized,
    options: z.array(Option).min(2),
    explanation: Localized,
    reference: Localized,
    tags: z.array(z.string()),
  })
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (q.type === "SINGLE" && (correct !== 1 || q.selectCount !== 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SINGLE question ${q.id} must have exactly 1 correct option and selectCount 1`,
      });
    }
    if (q.type === "MULTI" && (correct !== q.selectCount || q.selectCount < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `MULTI question ${q.id} must have selectCount>=2 correct options matching selectCount`,
      });
    }
    const optionIds = new Set(q.options.map((o) => o.id));
    if (optionIds.size !== q.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Question ${q.id} has duplicate option ids`,
      });
    }
  });

export const QuestionBankSchema = z
  .object({
    schemaVersion: z.literal(1),
    questions: z.array(QuestionSchema),
  })
  .superRefine((bank, ctx) => {
    const seen = new Set<string>();
    for (const q of bank.questions) {
      if (seen.has(q.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate question id ${q.id}`,
        });
      }
      seen.add(q.id);
    }
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/content/schema.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/schema.ts src/lib/content/schema.test.ts
git commit -m "feat: add Zod schema with correct-count and uniqueness invariants"
```

---

### Task 4: Bank loader + real-bank validation guard

**Files:**
- Create: `src/lib/content/loadBank.ts`
- Test: `src/lib/content/loadBank.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/content/loadBank.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { loadQuestionBank } from "./loadBank";
import { MODULE_IDS } from "./types";

describe("loadQuestionBank", () => {
  it("loads and validates the real bank, covering all 8 modules", () => {
    const bank = loadQuestionBank();
    expect(bank.schemaVersion).toBe(1);
    expect(bank.questions.length).toBeGreaterThanOrEqual(50);
    const modules = new Set(bank.questions.map((q) => q.moduleId));
    for (const m of MODULE_IDS) {
      expect(modules.has(m)).toBe(true);
    }
  });

  it("returns the same cached instance on repeated calls", () => {
    expect(loadQuestionBank()).toBe(loadQuestionBank());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/content/loadBank.test.ts`
Expected: FAIL — `Cannot find module './loadBank'`.

- [ ] **Step 3: Create `src/lib/content/loadBank.ts`**

```ts
import bankJson from "../../../content/question-bank.json";
import { QuestionBankSchema } from "./schema";
import type { QuestionBank } from "./types";

let cached: QuestionBank | null = null;

/**
 * Loads and validates the question bank once, caching the result.
 * Throws (via Zod) if the bank file violates the schema or invariants.
 */
export function loadQuestionBank(): QuestionBank {
  if (cached) return cached;
  cached = QuestionBankSchema.parse(bankJson) as QuestionBank;
  return cached;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/content/loadBank.test.ts`
Expected: PASS — both tests green. (If it fails on schema parse, the bank file has a real defect — fix the bank, not the test.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/loadBank.ts src/lib/content/loadBank.test.ts
git commit -m "feat: add validated, cached question-bank loader"
```

---

### Task 5: Exam config + weighted quota allocation (largest remainder)

**Files:**
- Create: `src/lib/exam/config.ts`
- Create: `src/lib/exam/quota.ts`
- Test: `src/lib/exam/quota.test.ts`

- [ ] **Step 1: Create `src/lib/exam/config.ts`**

```ts
import type { ExamCertLevel, ModuleId } from "../content/types";

export interface ExamSpec {
  totalQuestions: number;
  timeLimitMinutes: number;
  passThreshold: number; // 0..1
}

export const EXAM_SPECS: Record<ExamCertLevel, ExamSpec> = {
  BASIC: { totalQuestions: 35, timeLimitMinutes: 90, passThreshold: 0.65 },
  ADVANCED: { totalQuestions: 50, timeLimitMinutes: 60, passThreshold: 0.8 },
};

// Each map's shares sum to 1.0.
export const SUBJECT_WEIGHTS: Record<ExamCertLevel, Record<ModuleId, number>> = {
  BASIC: {
    "air-law": 0.3,
    "flight-operations": 0.16,
    "human-factors": 0.12,
    meteorology: 0.1,
    navigation: 0.08,
    "airframes-systems": 0.1,
    radiotelephony: 0.08,
    "theory-of-flight": 0.06,
  },
  ADVANCED: {
    "air-law": 0.28,
    "flight-operations": 0.16,
    "human-factors": 0.12,
    meteorology: 0.1,
    navigation: 0.1,
    "airframes-systems": 0.08,
    radiotelephony: 0.1,
    "theory-of-flight": 0.06,
  },
};
```

- [ ] **Step 2: Write the failing test `src/lib/exam/quota.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { allocateQuotas } from "./quota";
import { SUBJECT_WEIGHTS } from "./config";
import { MODULE_IDS } from "../content/types";

describe("allocateQuotas", () => {
  it("sums exactly to the total for a Basic exam", () => {
    const q = allocateQuotas(35, SUBJECT_WEIGHTS.BASIC);
    const sum = MODULE_IDS.reduce((acc, m) => acc + q[m], 0);
    expect(sum).toBe(35);
  });

  it("sums exactly to the total for an Advanced exam", () => {
    const q = allocateQuotas(50, SUBJECT_WEIGHTS.ADVANCED);
    const sum = MODULE_IDS.reduce((acc, m) => acc + q[m], 0);
    expect(sum).toBe(50);
  });

  it("gives air-law the largest quota (highest weight)", () => {
    const q = allocateQuotas(35, SUBJECT_WEIGHTS.BASIC);
    const max = Math.max(...MODULE_IDS.map((m) => q[m]));
    expect(q["air-law"]).toBe(max);
  });

  it("never assigns a negative quota", () => {
    const q = allocateQuotas(35, SUBJECT_WEIGHTS.BASIC);
    for (const m of MODULE_IDS) expect(q[m]).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test src/lib/exam/quota.test.ts`
Expected: FAIL — `Cannot find module './quota'`.

- [ ] **Step 4: Create `src/lib/exam/quota.ts`**

```ts
import { MODULE_IDS, type ModuleId } from "../content/types";

/**
 * Allocates `total` questions across modules proportional to `weights`
 * using the largest-remainder method so the result sums exactly to `total`.
 */
export function allocateQuotas(
  total: number,
  weights: Record<ModuleId, number>,
): Record<ModuleId, number> {
  const quotas = {} as Record<ModuleId, number>;
  const remainders: { id: ModuleId; rem: number }[] = [];
  let allocated = 0;

  for (const id of MODULE_IDS) {
    const exact = total * (weights[id] ?? 0);
    const floor = Math.floor(exact);
    quotas[id] = floor;
    allocated += floor;
    remainders.push({ id, rem: exact - floor });
  }

  let remaining = total - allocated; // integer in [0, MODULE_IDS.length)
  remainders.sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < remaining; i++) {
    quotas[remainders[i].id] += 1;
  }
  return quotas;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/lib/exam/quota.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exam/config.ts src/lib/exam/quota.ts src/lib/exam/quota.test.ts
git commit -m "feat: add exam specs and largest-remainder quota allocation"
```

---

### Task 6: Seedable RNG + weighted exam generation with backfill

**Files:**
- Create: `src/lib/exam/rng.ts`
- Create: `src/lib/exam/generate.ts`
- Test: `src/lib/exam/generate.test.ts`

- [ ] **Step 1: Create `src/lib/exam/rng.ts`**

```ts
/** Deterministic, seedable PRNG (mulberry32) returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 2: Write the failing test `src/lib/exam/generate.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { eligible, generateExam } from "./generate";
import { loadQuestionBank } from "../content/loadBank";
import { mulberry32 } from "./rng";

const bank = loadQuestionBank();

describe("eligible", () => {
  it("includes BOTH and the requested level, excludes the other level", () => {
    const basic = eligible(bank.questions, "BASIC");
    expect(basic.every((q) => q.certLevel === "BASIC" || q.certLevel === "BOTH")).toBe(true);
    expect(basic.some((q) => q.certLevel === "ADVANCED")).toBe(false);
  });
});

describe("generateExam", () => {
  it("fills a full 35-question Basic mock with no duplicates", () => {
    const exam = generateExam("BASIC", 35, mulberry32(42), bank);
    expect(exam).toHaveLength(35);
    expect(new Set(exam.map((q) => q.id)).size).toBe(35);
    expect(exam.every((q) => q.certLevel !== "ADVANCED")).toBe(true);
  });

  it("returns min(total, eligiblePool) — never repeats or invents (Advanced seed = 48)", () => {
    const eligibleCount = eligible(bank.questions, "ADVANCED").length;
    const exam = generateExam("ADVANCED", 50, mulberry32(7), bank);
    expect(exam).toHaveLength(Math.min(50, eligibleCount));
    expect(new Set(exam.map((q) => q.id)).size).toBe(exam.length);
  });

  it("is deterministic for a given seed", () => {
    const a = generateExam("BASIC", 35, mulberry32(99), bank).map((q) => q.id);
    const b = generateExam("BASIC", 35, mulberry32(99), bank).map((q) => q.id);
    expect(a).toEqual(b);
  });

  it("produces different sets for different seeds", () => {
    const a = generateExam("BASIC", 35, mulberry32(1), bank).map((q) => q.id);
    const b = generateExam("BASIC", 35, mulberry32(2), bank).map((q) => q.id);
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test src/lib/exam/generate.test.ts`
Expected: FAIL — `Cannot find module './generate'`.

- [ ] **Step 4: Create `src/lib/exam/generate.ts`**

```ts
import { loadQuestionBank } from "../content/loadBank";
import { allocateQuotas } from "./quota";
import { SUBJECT_WEIGHTS } from "./config";
import {
  MODULE_IDS,
  type ExamCertLevel,
  type Question,
  type QuestionBank,
} from "../content/types";

/** Questions usable for a given exam level: the level itself plus BOTH. */
export function eligible(questions: Question[], certLevel: ExamCertLevel): Question[] {
  return questions.filter((q) => q.certLevel === certLevel || q.certLevel === "BOTH");
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generates a weighted exam: draws per-subject quotas, then backfills any
 * shortfall from the remaining eligible pool. Never repeats or invents a
 * question, so the result length is min(total, eligiblePoolSize).
 */
export function generateExam(
  certLevel: ExamCertLevel,
  total: number,
  rng: () => number,
  bank: QuestionBank = loadQuestionBank(),
): Question[] {
  const pool = eligible(bank.questions, certLevel);
  const quotas = allocateQuotas(total, SUBJECT_WEIGHTS[certLevel]);

  const picked: Question[] = [];
  const usedIds = new Set<string>();

  for (const mod of MODULE_IDS) {
    const subjectPool = shuffle(
      pool.filter((q) => q.moduleId === mod),
      rng,
    );
    for (const q of subjectPool.slice(0, quotas[mod])) {
      picked.push(q);
      usedIds.add(q.id);
    }
  }

  if (picked.length < total) {
    const leftovers = shuffle(
      pool.filter((q) => !usedIds.has(q.id)),
      rng,
    );
    for (const q of leftovers) {
      if (picked.length >= total) break;
      picked.push(q);
      usedIds.add(q.id);
    }
  }

  return shuffle(picked, rng);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/lib/exam/generate.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exam/rng.ts src/lib/exam/generate.ts src/lib/exam/generate.test.ts
git commit -m "feat: add seedable RNG and weighted exam generation with backfill"
```

---

### Task 7: Server-side grading (SINGLE + MULTI exact-set match)

**Files:**
- Create: `src/lib/exam/grade.ts`
- Test: `src/lib/exam/grade.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/exam/grade.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { correctOptionIds, isAnswerCorrect } from "./grade";
import type { Question } from "../content/types";

const single: Question = {
  id: "air-law-0001",
  moduleId: "air-law",
  certLevel: "BOTH",
  type: "SINGLE",
  selectCount: 1,
  difficulty: 1,
  stem: { EN: "?", FR: "?" },
  options: [
    { id: "a", label: { EN: "A", FR: "A" }, isCorrect: false },
    { id: "b", label: { EN: "B", FR: "B" }, isCorrect: true },
  ],
  explanation: { EN: "", FR: "" } as never, // not used by grader
  reference: { EN: "", FR: "" } as never,
  tags: [],
};

const multi: Question = {
  ...single,
  id: "air-law-0011",
  type: "MULTI",
  selectCount: 2,
  options: [
    { id: "a", label: { EN: "A", FR: "A" }, isCorrect: true },
    { id: "b", label: { EN: "B", FR: "B" }, isCorrect: true },
    { id: "c", label: { EN: "C", FR: "C" }, isCorrect: false },
  ],
};

describe("correctOptionIds", () => {
  it("returns the sorted correct ids", () => {
    expect(correctOptionIds(multi)).toEqual(["a", "b"]);
  });
});

describe("isAnswerCorrect", () => {
  it("grades a correct SINGLE answer", () => {
    expect(isAnswerCorrect(single, ["b"])).toBe(true);
  });
  it("grades a wrong SINGLE answer", () => {
    expect(isAnswerCorrect(single, ["a"])).toBe(false);
  });
  it("treats no selection as incorrect", () => {
    expect(isAnswerCorrect(single, [])).toBe(false);
  });
  it("requires an exact set match for MULTI", () => {
    expect(isAnswerCorrect(multi, ["a", "b"])).toBe(true);
    expect(isAnswerCorrect(multi, ["b", "a"])).toBe(true); // order-independent
  });
  it("rejects a partial MULTI selection", () => {
    expect(isAnswerCorrect(multi, ["a"])).toBe(false);
  });
  it("rejects a MULTI selection containing a wrong option", () => {
    expect(isAnswerCorrect(multi, ["a", "b", "c"])).toBe(false);
  });
  it("ignores duplicate selections", () => {
    expect(isAnswerCorrect(multi, ["a", "a", "b"])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/exam/grade.test.ts`
Expected: FAIL — `Cannot find module './grade'`.

- [ ] **Step 3: Create `src/lib/exam/grade.ts`**

```ts
import type { Question } from "../content/types";

/** Sorted list of the correct option ids for a question. */
export function correctOptionIds(q: Question): string[] {
  return q.options
    .filter((o) => o.isCorrect)
    .map((o) => o.id)
    .sort();
}

/**
 * True iff the selected option ids exactly match the correct set.
 * Works for SINGLE (one correct) and MULTI (exact-set, no partial credit).
 * Duplicate selections are ignored.
 */
export function isAnswerCorrect(q: Question, selected: string[]): boolean {
  const sel = [...new Set(selected)].sort();
  const correct = correctOptionIds(q);
  if (sel.length !== correct.length) return false;
  return sel.every((id, i) => id === correct[i]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/exam/grade.test.ts`
Expected: PASS — all 8 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exam/grade.ts src/lib/exam/grade.test.ts
git commit -m "feat: add server-side grading for single and multi questions"
```

---

### Task 8: Scoring with per-subject breakdown

**Files:**
- Create: `src/lib/exam/score.ts`
- Test: `src/lib/exam/score.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/exam/score.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { scoreExam } from "./score";
import type { Question } from "../content/types";

function q(id: string, moduleId: Question["moduleId"], correctId: string): Question {
  return {
    id,
    moduleId,
    certLevel: "BOTH",
    type: "SINGLE",
    selectCount: 1,
    difficulty: 1,
    stem: { EN: "?", FR: "?" },
    options: [
      { id: "a", label: { EN: "A", FR: "A" }, isCorrect: correctId === "a" },
      { id: "b", label: { EN: "B", FR: "B" }, isCorrect: correctId === "b" },
    ],
    explanation: { EN: "x", FR: "x" },
    reference: { EN: "x", FR: "x" },
    tags: [],
  };
}

const questions = [
  q("air-law-0001", "air-law", "a"),
  q("air-law-0002", "air-law", "a"),
  q("navigation-0001", "navigation", "b"),
];

describe("scoreExam", () => {
  it("computes overall score, pass flag and per-subject breakdown", () => {
    const answers = {
      "air-law-0001": ["a"], // correct
      "air-law-0002": ["b"], // wrong
      "navigation-0001": ["b"], // correct
    };
    const result = scoreExam(questions, answers, 0.65);
    expect(result.total).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.scorePct).toBeCloseTo(2 / 3, 5);
    expect(result.passed).toBe(true); // 0.666 >= 0.65

    const airLaw = result.bySubject.find((s) => s.moduleId === "air-law");
    expect(airLaw).toEqual({ moduleId: "air-law", correct: 1, total: 2 });
    const nav = result.bySubject.find((s) => s.moduleId === "navigation");
    expect(nav).toEqual({ moduleId: "navigation", correct: 1, total: 1 });
  });

  it("treats a missing answer as incorrect and can fail the threshold", () => {
    const result = scoreExam(questions, { "air-law-0001": ["a"] }, 0.65);
    expect(result.correct).toBe(1);
    expect(result.passed).toBe(false); // 0.333 < 0.65
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/exam/score.test.ts`
Expected: FAIL — `Cannot find module './score'`.

- [ ] **Step 3: Create `src/lib/exam/score.ts`**

```ts
import type { ModuleId, Question } from "../content/types";
import { isAnswerCorrect } from "./grade";

export interface SubjectScore {
  moduleId: ModuleId;
  correct: number;
  total: number;
}

export interface ExamResult {
  total: number;
  correct: number;
  scorePct: number; // 0..1
  passed: boolean;
  bySubject: SubjectScore[];
}

/**
 * Grades every question against the submitted answers (missing answer =
 * incorrect) and returns overall score plus a per-subject breakdown.
 */
export function scoreExam(
  questions: Question[],
  answers: Record<string, string[]>,
  passThreshold: number,
): ExamResult {
  const bySubject = new Map<ModuleId, SubjectScore>();
  let correct = 0;

  for (const q of questions) {
    const ok = isAnswerCorrect(q, answers[q.id] ?? []);
    if (ok) correct++;
    const s = bySubject.get(q.moduleId) ?? { moduleId: q.moduleId, correct: 0, total: 0 };
    s.total += 1;
    if (ok) s.correct += 1;
    bySubject.set(q.moduleId, s);
  }

  const total = questions.length;
  const scorePct = total === 0 ? 0 : correct / total;
  return {
    total,
    correct,
    scorePct,
    passed: scorePct >= passThreshold,
    bySubject: [...bySubject.values()],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/exam/score.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exam/score.ts src/lib/exam/score.test.ts
git commit -m "feat: add exam scoring with per-subject breakdown"
```

---

### Task 9: Session store interface + in-memory implementation

**Files:**
- Create: `src/lib/exam/store.ts`
- Test: `src/lib/exam/store.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/exam/store.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { InMemorySessionStore, type ExamSession } from "./store";

function makeSession(id: string): ExamSession {
  return {
    id,
    certLevel: "BASIC",
    locale: "EN",
    questionIds: ["air-law-0001"],
    startedAt: 0,
    expiresAt: 1000,
    answers: {},
    submitted: false,
  };
}

describe("InMemorySessionStore", () => {
  it("creates and gets a session", async () => {
    const store = new InMemorySessionStore();
    await store.create(makeSession("s1"));
    const got = await store.get("s1");
    expect(got?.id).toBe("s1");
  });

  it("returns null for an unknown id", async () => {
    const store = new InMemorySessionStore();
    expect(await store.get("nope")).toBeNull();
  });

  it("returns copies so callers cannot mutate stored state directly", async () => {
    const store = new InMemorySessionStore();
    await store.create(makeSession("s2"));
    const a = (await store.get("s2"))!;
    a.answers["air-law-0001"] = ["a"];
    const b = (await store.get("s2"))!;
    expect(b.answers["air-law-0001"]).toBeUndefined();
  });

  it("persists updates", async () => {
    const store = new InMemorySessionStore();
    await store.create(makeSession("s3"));
    const s = (await store.get("s3"))!;
    s.answers["air-law-0001"] = ["b"];
    s.submitted = true;
    await store.update(s);
    const got = (await store.get("s3"))!;
    expect(got.submitted).toBe(true);
    expect(got.answers["air-law-0001"]).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/exam/store.test.ts`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Create `src/lib/exam/store.ts`**

```ts
import type { ExamCertLevel, Locale } from "../content/types";

export interface ExamSession {
  id: string;
  certLevel: ExamCertLevel;
  locale: Locale;
  questionIds: string[];
  startedAt: number;
  expiresAt: number;
  answers: Record<string, string[]>;
  submitted: boolean;
}

export interface SessionStore {
  create(session: ExamSession): Promise<void>;
  get(id: string): Promise<ExamSession | null>;
  update(session: ExamSession): Promise<void>;
}

/** In-memory store for dev/test. Swap for a Prisma-backed store in Plan 3. */
export class InMemorySessionStore implements SessionStore {
  private map = new Map<string, ExamSession>();

  async create(session: ExamSession): Promise<void> {
    this.map.set(session.id, structuredClone(session));
  }

  async get(id: string): Promise<ExamSession | null> {
    const s = this.map.get(id);
    return s ? structuredClone(s) : null;
  }

  async update(session: ExamSession): Promise<void> {
    this.map.set(session.id, structuredClone(session));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/exam/store.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exam/store.ts src/lib/exam/store.test.ts
git commit -m "feat: add session store interface and in-memory implementation"
```

---

### Task 10: Public question serialization (strips isCorrect)

**Files:**
- Create: `src/lib/exam/serialize.ts`
- Test: `src/lib/exam/serialize.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/exam/serialize.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { toPublicQuestion } from "./serialize";
import type { Question } from "../content/types";

const q: Question = {
  id: "air-law-0001",
  moduleId: "air-law",
  certLevel: "BOTH",
  type: "SINGLE",
  selectCount: 1,
  difficulty: 1,
  stem: { EN: "English stem", FR: "Énoncé français" },
  options: [
    { id: "a", label: { EN: "Opt A", FR: "Option A" }, isCorrect: true },
    { id: "b", label: { EN: "Opt B", FR: "Option B" }, isCorrect: false },
  ],
  explanation: { EN: "expl", FR: "expl" },
  reference: { EN: "ref", FR: "ref" },
  tags: ["x"],
};

describe("toPublicQuestion", () => {
  it("returns localized stem and options for the requested locale", () => {
    const pub = toPublicQuestion(q, "FR");
    expect(pub.stem).toBe("Énoncé français");
    expect(pub.options[0].label).toBe("Option A");
    expect(pub.selectCount).toBe(1);
  });

  it("never includes isCorrect, explanation or reference", () => {
    const pub = toPublicQuestion(q, "EN");
    const serialized = JSON.stringify(pub);
    expect(serialized).not.toContain("isCorrect");
    expect(serialized).not.toContain("expl");
    expect(serialized).not.toContain("ref");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/exam/serialize.test.ts`
Expected: FAIL — `Cannot find module './serialize'`.

- [ ] **Step 3: Create `src/lib/exam/serialize.ts`**

```ts
import type { Locale, Question } from "../content/types";

export interface PublicOption {
  id: string;
  label: string;
}

export interface PublicQuestion {
  id: string;
  moduleId: string;
  type: "SINGLE" | "MULTI";
  selectCount: number;
  stem: string;
  options: PublicOption[];
}

/**
 * Projects a Question to the client-safe shape for a locale.
 * Deliberately omits isCorrect, explanation and reference so correct
 * answers never reach the client during an exam.
 */
export function toPublicQuestion(q: Question, locale: Locale): PublicQuestion {
  return {
    id: q.id,
    moduleId: q.moduleId,
    type: q.type,
    selectCount: q.selectCount,
    stem: q.stem[locale],
    options: q.options.map((o) => ({ id: o.id, label: o.label[locale] })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/exam/serialize.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exam/serialize.ts src/lib/exam/serialize.test.ts
git commit -m "feat: add client-safe question serialization that strips answers"
```

---

### Task 11: ExamService orchestration (create / serve / answer / submit)

**Files:**
- Create: `src/lib/exam/service.ts`
- Test: `src/lib/exam/service.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/exam/service.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { ExamService } from "./service";
import { InMemorySessionStore } from "./store";
import { loadQuestionBank } from "../content/loadBank";
import { correctOptionIds } from "./grade";

const bank = loadQuestionBank();

function newService() {
  return new ExamService(new InMemorySessionStore(), () => 1_000, bank);
}

describe("ExamService", () => {
  it("creates a Basic mock with 35 questions and a 90-minute expiry", async () => {
    const svc = newService();
    const created = await svc.createMock("BASIC", "EN", 42);
    expect(created.total).toBe(35);
    expect(created.expiresAt).toBe(1_000 + 90 * 60_000);
    expect(typeof created.sessionId).toBe("string");
  });

  it("serves public questions without leaking isCorrect", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    const questions = await svc.getPublicQuestions(sessionId);
    expect(questions).not.toBeNull();
    expect(questions!.length).toBe(35);
    expect(JSON.stringify(questions)).not.toContain("isCorrect");
  });

  it("rejects an answer for a question not in the session", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    const ok = await svc.answer(sessionId, "not-in-exam-9999", ["a"]);
    expect(ok).toBe(false);
  });

  it("grades a fully-correct submission as 100% and passed", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    const questions = await svc.getPublicQuestions(sessionId);
    for (const pub of questions!) {
      const full = bank.questions.find((q) => q.id === pub.id)!;
      await svc.answer(sessionId, pub.id, correctOptionIds(full));
    }
    const result = await svc.submit(sessionId);
    expect(result).not.toBeNull();
    expect(result!.correct).toBe(35);
    expect(result!.scorePct).toBe(1);
    expect(result!.passed).toBe(true);
  });

  it("does not accept answers after submission", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    const questions = await svc.getPublicQuestions(sessionId);
    await svc.submit(sessionId);
    const ok = await svc.answer(sessionId, questions![0].id, ["a"]);
    expect(ok).toBe(false);
  });

  it("returns null for operations on an unknown session", async () => {
    const svc = newService();
    expect(await svc.getPublicQuestions("missing")).toBeNull();
    expect(await svc.submit("missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/exam/service.test.ts`
Expected: FAIL — `Cannot find module './service'`.

- [ ] **Step 3: Create `src/lib/exam/service.ts`**

```ts
import { randomUUID } from "node:crypto";
import { loadQuestionBank } from "../content/loadBank";
import { EXAM_SPECS } from "./config";
import { generateExam } from "./generate";
import { mulberry32 } from "./rng";
import { scoreExam, type ExamResult } from "./score";
import { toPublicQuestion, type PublicQuestion } from "./serialize";
import type { SessionStore, ExamSession } from "./store";
import type { ExamCertLevel, Locale, Question, QuestionBank } from "../content/types";

export interface CreatedExam {
  sessionId: string;
  expiresAt: number;
  total: number;
}

/**
 * Orchestrates exam lifecycle using an injectable store, clock and bank.
 * All grading happens here (server side); clients only ever receive
 * public questions and, after submit, a scored result.
 */
export class ExamService {
  constructor(
    private store: SessionStore,
    private now: () => number = Date.now,
    private bank: QuestionBank = loadQuestionBank(),
  ) {}

  async createMock(
    certLevel: ExamCertLevel,
    locale: Locale,
    seed: number = Math.floor(Math.random() * 1e9),
  ): Promise<CreatedExam> {
    const spec = EXAM_SPECS[certLevel];
    const questions = generateExam(certLevel, spec.totalQuestions, mulberry32(seed), this.bank);
    const startedAt = this.now();
    const session: ExamSession = {
      id: randomUUID(),
      certLevel,
      locale,
      questionIds: questions.map((q) => q.id),
      startedAt,
      expiresAt: startedAt + spec.timeLimitMinutes * 60_000,
      answers: {},
      submitted: false,
    };
    await this.store.create(session);
    return { sessionId: session.id, expiresAt: session.expiresAt, total: questions.length };
  }

  private byId(id: string): Question | undefined {
    return this.bank.questions.find((q) => q.id === id);
  }

  async getPublicQuestions(sessionId: string): Promise<PublicQuestion[] | null> {
    const session = await this.store.get(sessionId);
    if (!session) return null;
    return session.questionIds
      .map((id) => this.byId(id))
      .filter((q): q is Question => Boolean(q))
      .map((q) => toPublicQuestion(q, session.locale));
  }

  async answer(sessionId: string, questionId: string, selected: string[]): Promise<boolean> {
    const session = await this.store.get(sessionId);
    if (!session || session.submitted) return false;
    if (!session.questionIds.includes(questionId)) return false;
    session.answers[questionId] = selected;
    await this.store.update(session);
    return true;
  }

  async submit(sessionId: string): Promise<ExamResult | null> {
    const session = await this.store.get(sessionId);
    if (!session) return null;
    session.submitted = true;
    await this.store.update(session);
    const questions = session.questionIds
      .map((id) => this.byId(id))
      .filter((q): q is Question => Boolean(q));
    return scoreExam(questions, session.answers, EXAM_SPECS[session.certLevel].passThreshold);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/exam/service.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exam/service.ts src/lib/exam/service.test.ts
git commit -m "feat: add ExamService orchestration for create/serve/answer/submit"
```

---

### Task 12: API route handlers (web-standard Request → Response)

**Files:**
- Create: `src/lib/exam/instance.ts`
- Create: `app/api/exam/route.ts`
- Create: `app/api/exam/[id]/questions/route.ts`
- Create: `app/api/exam/[id]/answer/route.ts`
- Create: `app/api/exam/[id]/submit/route.ts`
- Test: `app/api/exam/routes.test.ts`

- [ ] **Step 1: Create the shared service singleton `src/lib/exam/instance.ts`**

```ts
import { ExamService } from "./service";
import { InMemorySessionStore } from "./store";

// Single in-process service instance. Replaced by a Prisma-backed store in Plan 3.
export const examService = new ExamService(new InMemorySessionStore());
```

- [ ] **Step 2: Write the failing test `app/api/exam/routes.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { POST as createExam } from "./route";
import { GET as getQuestions } from "./[id]/questions/route";
import { POST as postAnswer } from "./[id]/answer/route";
import { POST as postSubmit } from "./[id]/submit/route";

async function json(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("exam API route handlers", () => {
  it("POST /api/exam creates a Basic session", async () => {
    const res = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        body: JSON.stringify({ certLevel: "BASIC", locale: "EN", seed: 42 }),
      }),
    );
    const { status, body } = await json(res);
    expect(status).toBe(201);
    expect(body.total).toBe(35);
    expect(typeof body.sessionId).toBe("string");
  });

  it("400 on invalid create payload", async () => {
    const res = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        body: JSON.stringify({ certLevel: "PRO", locale: "EN" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("runs the full create → questions → answer → submit flow", async () => {
    const createRes = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        body: JSON.stringify({ certLevel: "BASIC", locale: "EN", seed: 7 }),
      }),
    );
    const { sessionId } = (await createRes.json()) as { sessionId: string };

    const qRes = await getQuestions(new Request("http://test"), {
      params: Promise.resolve({ id: sessionId }),
    });
    const questions = (await qRes.json()) as { id: string }[];
    expect(questions.length).toBe(35);
    expect(JSON.stringify(questions)).not.toContain("isCorrect");

    const ansRes = await postAnswer(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ questionId: questions[0].id, selectedOptionIds: ["a"] }),
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );
    expect(ansRes.status).toBe(200);

    const subRes = await postSubmit(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: sessionId }),
    });
    const result = (await subRes.json()) as { total: number; passed: boolean };
    expect(result.total).toBe(35);
    expect(typeof result.passed).toBe("boolean");
  });

  it("404 when questions requested for an unknown session", async () => {
    const res = await getQuestions(new Request("http://test"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test app/api/exam/routes.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 4: Create `app/api/exam/route.ts`**

```ts
import { z } from "zod";
import { examService } from "../../../src/lib/exam/instance";

const CreateBody = z.object({
  certLevel: z.enum(["BASIC", "ADVANCED"]),
  locale: z.enum(["EN", "FR"]),
  seed: z.number().int().optional(),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { certLevel, locale, seed } = parsed.data;
  const created = await examService.createMock(certLevel, locale, seed);
  return Response.json(created, { status: 201 });
}
```

- [ ] **Step 5: Create `app/api/exam/[id]/questions/route.ts`**

```ts
import { examService } from "../../../../../src/lib/exam/instance";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const questions = await examService.getPublicQuestions(id);
  if (questions === null) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  return Response.json(questions, { status: 200 });
}
```

- [ ] **Step 6: Create `app/api/exam/[id]/answer/route.ts`**

```ts
import { z } from "zod";
import { examService } from "../../../../../src/lib/exam/instance";

type Ctx = { params: Promise<{ id: string }> };

const AnswerBody = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()),
});

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = AnswerBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const ok = await examService.answer(id, parsed.data.questionId, parsed.data.selectedOptionIds);
  if (!ok) {
    return Response.json({ error: "answer rejected" }, { status: 409 });
  }
  return Response.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 7: Create `app/api/exam/[id]/submit/route.ts`**

```ts
import { examService } from "../../../../../src/lib/exam/instance";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const result = await examService.submit(id);
  if (result === null) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  return Response.json(result, { status: 200 });
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test app/api/exam/routes.test.ts`
Expected: PASS — all 4 tests green.

> Note: handler context uses `params: Promise<{ id: string }>` to match the Next.js 15 App Router async-params signature, so these files mount as real routes in Plan 2 unchanged.

- [ ] **Step 9: Run the full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all test files pass; no type errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/exam/instance.ts app/api/exam
git commit -m "feat: add exam API route handlers (create/questions/answer/submit)"
```

---

## Definition of Done (Plan 1)

- `pnpm test` is green across all suites; `pnpm typecheck` clean.
- You can, in code/tests: create a weighted Basic mock (35 Q), fetch public questions with **no** `isCorrect` leaked, submit answers, and receive a scored result with a per-subject breakdown.
- Advanced mock returns 48 questions until the bank gains ≥2 more eligible Advanced/BOTH questions (documented, not a bug).
- All grading is server-side; the in-memory store is swappable behind `SessionStore`.

## Handoff to Plan 2
- Mount the four handlers as real Next.js routes (they already use the App Router async-params signature).
- Build the locale-routed exam UI: question palette, timer (server-authoritative via `expiresAt`), single/multi selectors, and the **per-subject results table** (the "12 of 14" view) from `ExamResult.bySubject`.
- Add a `GET /api/exam/[id]/review` endpoint (post-submission only) returning explanations + references for incorrect answers.

---

## Self-Review (completed)

- **Spec coverage:** This plan implements the engine portions of technical-design §6 (types/model subset), §8 (generation/weighting/grading/scoring/timing fields), §9 (API surface: create/questions/answer/submit — review deferred to Plan 2), and §15 (schema). LMS rendering (§5.1, §11), auth/progress (§5.3, §12), Prisma persistence (§6 full), and full i18n UI (§7) are explicitly assigned to Plans 2–4.
- **Placeholder scan:** No TBD/TODO/"add error handling" placeholders; every code and test step contains complete, runnable content.
- **Type consistency:** `ExamCertLevel` ("BASIC"|"ADVANCED") is used consistently for exam generation/config/store/service; `CertLevel` (adds "BOTH") is used for question data. `ExamResult`/`SubjectScore` shapes match between `score.ts` and `service.ts`. `PublicQuestion` matches between `serialize.ts` and the route test. Handler context type `params: Promise<{id:string}>` is consistent across all four route files and their tests.
- **Known honest gap:** Advanced 50-question mock yields 48 with the current seed bank; asserted explicitly in Task 6 and called out in DoD rather than hidden.
