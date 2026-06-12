import { MODULE_IDS, type ExamCertLevel, type Question, type QuestionBank } from "../types";

// Deterministic in-memory question bank for exam UNIT tests (generate / access /
// optionOrder / service). Replaces the retired file bank — keeps these tests fast
// and DB-free. Per module: difficulty-0 ×3 (guest tasters) + difficulty-1 ×6
// (free / full exams), for both banks. Mirrors scripts/seed-test-fixtures.ts so
// unit and integration tests see the same shape.

const D0_PER_MODULE = 3;
const D1_PER_MODULE = 6;

const fourOptions = () => [
  { id: "a", label: { EN: "A", ZH: "甲" }, isCorrect: true },
  { id: "b", label: { EN: "B", ZH: "乙" }, isCorrect: false },
  { id: "c", label: { EN: "C", ZH: "丙" }, isCorrect: false },
  { id: "d", label: { EN: "D", ZH: "丁" }, isCorrect: false },
];

function questionsFor(level: ExamCertLevel): Question[] {
  const prefix = level === "BASIC" ? "basic" : "adv";
  const out: Question[] = [];
  for (const moduleId of MODULE_IDS) {
    for (const [difficulty, n] of [
      [0, D0_PER_MODULE],
      [1, D1_PER_MODULE],
    ] as const) {
      for (let i = 1; i <= n; i++) {
        out.push({
          id: `${prefix}-${moduleId}-d${difficulty}-${String(i).padStart(3, "0")}`,
          moduleId,
          certLevel: level,
          type: "SINGLE",
          selectCount: 1,
          difficulty,
          stem: { EN: `${moduleId} d${difficulty} #${i}`, ZH: `${moduleId} 难度${difficulty} 第${i}题` },
          options: fourOptions(),
          explanation: { EN: "Because A is correct.", ZH: "因为甲正确。" },
          reference: { EN: "ref", ZH: "出处" },
          tags: [],
        });
      }
    }
  }
  return out;
}

/** A fresh deterministic in-memory bank (basic + advanced) for exam unit tests. */
export function makeTestBank(): QuestionBank {
  return { schemaVersion: 1, questions: [...questionsFor("BASIC"), ...questionsFor("ADVANCED")] };
}
