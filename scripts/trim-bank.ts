/**
 * One-shot trim of content/question-bank.json from 300 → 150 questions.
 *
 * Selection (deterministic, reproducible):
 *   1. Force-keep every question referenced by a lesson <Checkpoint questionId="…" />.
 *   2. Force-keep every difficulty-0 BASIC-eligible question (GUEST taster pool).
 *   3. Fill each module's remaining quota with difficulty-stratified proportional
 *      sampling (largest-remainder), preserving the module's difficulty mix.
 *
 * Overwrites the bank in place (git diff is the audit trail) only after every
 * invariant below passes; otherwise it throws and writes nothing.
 *
 * Run: pnpm exec tsx scripts/trim-bank.ts
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MODULE_IDS, type ModuleId } from "../src/lib/content/types";
import { SUBJECT_WEIGHTS, EXAM_SPECS, GUEST_BASIC_QUESTION_COUNT } from "../src/lib/exam/config";
import { allocateQuotas } from "../src/lib/exam/quota";

type RawQuestion = {
  id: string;
  moduleId: ModuleId;
  certLevel: "BASIC" | "ADVANCED" | "BOTH";
  difficulty: number;
  [k: string]: unknown;
};
type RawBank = { schemaVersion: 1; questions: RawQuestion[] };

const ROOT = process.cwd();
const BANK_PATH = join(ROOT, "content", "question-bank.json");
const LESSONS_ROOT = join(ROOT, "content", "lessons");

/** Per-module questions to keep (Advanced exam weight × 3, rounded; sums to 150). */
const KEEP_QUOTA: Record<ModuleId, number> = {
  "air-law": 42,
  "flight-operations": 24,
  "human-factors": 18,
  meteorology: 15,
  navigation: 15,
  radiotelephony: 15,
  "airframes-systems": 12,
  "theory-of-flight": 9,
};
const TARGET_TOTAL = Object.values(KEEP_QUOTA).reduce((a, b) => a + b, 0); // 150

const isBasicEligible = (q: RawQuestion) => q.certLevel === "BASIC" || q.certLevel === "BOTH";
const isAdvEligible = (q: RawQuestion) => q.certLevel === "ADVANCED" || q.certLevel === "BOTH";

function collectCheckpointRefs(): Set<string> {
  const refs = new Set<string>();
  const re = /<Checkpoint\s+questionId="([^"]+)"/g;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".mdx")) {
        const src = readFileSync(p, "utf8");
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) refs.add(m[1]);
      }
    }
  };
  walk(LESSONS_ROOT);
  return refs;
}

/** Largest-remainder allocation of `total` across buckets, capped at each bucket size. */
function hamilton(sizes: number[], total: number): number[] {
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (total >= sum) return sizes.slice();
  const exact = sizes.map((s) => (total * s) / sum);
  const alloc = exact.map(Math.floor);
  let remaining = total - alloc.reduce((a, b) => a + b, 0);
  const byFrac = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of byFrac) {
    if (remaining <= 0) break;
    if (alloc[i] < sizes[i]) {
      alloc[i]++;
      remaining--;
    }
  }
  for (let i = 0; i < alloc.length && remaining > 0; i++) {
    while (alloc[i] < sizes[i] && remaining > 0) {
      alloc[i]++;
      remaining--;
    }
  }
  return alloc;
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`✗ invariant failed: ${msg}`);
}

function main() {
  const bank = JSON.parse(readFileSync(BANK_PATH, "utf8")) as RawBank;
  const questions = bank.questions;
  const byId = new Map(questions.map((q) => [q.id, q]));

  const checkpointRefs = collectCheckpointRefs();
  for (const id of checkpointRefs) {
    assert(byId.has(id), `lesson references missing question ${id}`);
  }

  // Forced keeps: every checkpoint-referenced question + every difficulty-0 BASIC-eligible.
  const forced = new Set<string>(checkpointRefs);
  for (const q of questions) {
    if (q.difficulty === 0 && isBasicEligible(q)) forced.add(q.id);
  }

  const keptIds = new Set<string>();
  for (const mod of MODULE_IDS) {
    const modQs = questions.filter((q) => q.moduleId === mod);
    const K = KEEP_QUOTA[mod];
    const forcedHere = modQs.filter((q) => forced.has(q.id));
    assert(forcedHere.length <= K, `module ${mod}: forced ${forcedHere.length} > quota ${K}`);
    for (const q of forcedHere) keptIds.add(q.id);

    const nonForced = modQs
      .filter((q) => !forced.has(q.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    const buckets = [0, 1, 2, 3].map((d) => nonForced.filter((q) => q.difficulty === d));
    const alloc = hamilton(
      buckets.map((b) => b.length),
      K - forcedHere.length,
    );
    buckets.forEach((b, d) => {
      for (let i = 0; i < alloc[d]; i++) keptIds.add(b[i].id);
    });
  }

  const kept = questions.filter((q) => keptIds.has(q.id));

  // ---- Invariants ----
  assert(kept.length === TARGET_TOTAL, `total kept ${kept.length} !== ${TARGET_TOTAL}`);
  for (const mod of MODULE_IDS) {
    const n = kept.filter((q) => q.moduleId === mod).length;
    assert(n === KEEP_QUOTA[mod], `module ${mod}: kept ${n} !== quota ${KEEP_QUOTA[mod]}`);
  }
  for (const id of checkpointRefs) {
    assert(keptIds.has(id), `checkpoint-referenced question ${id} was dropped`);
  }

  const d0BasicTotal = questions.filter((q) => q.difficulty === 0 && isBasicEligible(q)).length;
  const d0BasicKept = kept.filter((q) => q.difficulty === 0 && isBasicEligible(q)).length;
  assert(d0BasicKept === d0BasicTotal, `kept ${d0BasicKept}/${d0BasicTotal} difficulty-0 BASIC`);
  assert(
    d0BasicKept >= GUEST_BASIC_QUESTION_COUNT,
    `GUEST taster needs ≥${GUEST_BASIC_QUESTION_COUNT} difficulty-0 BASIC, kept ${d0BasicKept}`,
  );

  const d1BasicKept = kept.filter((q) => q.difficulty === 1 && isBasicEligible(q)).length;
  assert(d1BasicKept >= 35, `FREE sample needs ≥35 difficulty-1 BASIC, kept ${d1BasicKept}`);

  const basicEligibleKept = kept.filter(isBasicEligible).length;
  const advEligibleKept = kept.filter(isAdvEligible).length;
  assert(basicEligibleKept >= 35, `BASIC-eligible kept ${basicEligibleKept} < 35`);
  assert(advEligibleKept >= 50, `ADVANCED-eligible kept ${advEligibleKept} < 50`);

  // Each module must hold enough eligible questions for its exam quota (both levels).
  for (const level of ["BASIC", "ADVANCED"] as const) {
    const quotas = allocateQuotas(EXAM_SPECS[level].totalQuestions, SUBJECT_WEIGHTS[level]);
    const eligible = level === "BASIC" ? isBasicEligible : isAdvEligible;
    for (const mod of MODULE_IDS) {
      const n = kept.filter((q) => q.moduleId === mod && eligible(q)).length;
      assert(n >= quotas[mod], `${level} module ${mod}: eligible ${n} < exam quota ${quotas[mod]}`);
    }
  }

  // ---- Report ----
  console.log(`Trimmed ${questions.length} → ${kept.length} questions`);
  console.table(
    MODULE_IDS.map((mod) => ({
      module: mod,
      kept: kept.filter((q) => q.moduleId === mod).length,
      quota: KEEP_QUOTA[mod],
    })),
  );
  console.log(
    `BASIC-eligible: ${basicEligibleKept} · ADVANCED-eligible: ${advEligibleKept} · ` +
      `d0-BASIC: ${d0BasicKept} · d1-BASIC: ${d1BasicKept} · checkpoint refs: ${checkpointRefs.size}`,
  );

  const out: RawBank = { schemaVersion: bank.schemaVersion, questions: kept };
  writeFileSync(BANK_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`✓ wrote ${BANK_PATH}`);
}

main();
