/**
 * Seeds a deterministic, richer dataset for the TEST database only (run by
 * vitest.globalSetup against a --force-reset DB). Kept separate from the minimal
 * production seed (scripts/seed-content.ts) so integration tests have enough
 * questions to generate full exams and a stable set of lessons to read.
 *
 * Not idempotent — assumes empty tables (force-reset).
 */
import { prisma } from "../src/lib/db";
import { MODULE_IDS, questionBankPrefix } from "../src/lib/content/types";

const FOUR_OPTIONS = [
  { optionId: "a", labelEN: "A", labelZH: "甲", isCorrect: true },
  { optionId: "b", labelEN: "B", labelZH: "乙", isCorrect: false },
  { optionId: "c", labelEN: "C", labelZH: "丙", isCorrect: false },
  { optionId: "d", labelEN: "D", labelZH: "丁", isCorrect: false },
];

// Per module: difficulty-0 ×3 (guest tasters) + difficulty-1 ×6 (free/full exams).
const D0_PER_MODULE = 3;
const D1_PER_MODULE = 6;

async function seedBank(bank: "basic" | "advanced"): Promise<number> {
  let count = 0;
  const prefix = questionBankPrefix(bank === "basic" ? "BASIC" : "ADVANCED");
  for (const moduleId of MODULE_IDS) {
    for (const [difficulty, n] of [
      [0, D0_PER_MODULE],
      [1, D1_PER_MODULE],
    ] as const) {
      for (let i = 1; i <= n; i++) {
        const id = `${prefix}-${moduleId}-d${difficulty}-${String(i).padStart(3, "0")}`;
        const data = {
          id,
          moduleId,
          type: "SINGLE",
          selectCount: 1,
          difficulty,
          stemEN: `${moduleId} d${difficulty} #${i}`,
          stemZH: `${moduleId} 难度${difficulty} 第${i}题`,
          explEN: "Because A is correct.",
          explZH: "因为 A 正确。",
          refEN: "ref",
          refZH: "出处",
          options: { create: FOUR_OPTIONS },
        };
        if (bank === "basic") await prisma.basicQuestionBank.create({ data });
        else await prisma.advancedQuestionBank.create({ data });
        count++;
      }
    }
  }
  return count;
}

type LessonSeed = {
  course: "basic" | "advanced";
  moduleId: string;
  slug: string;
  order: number;
  access: "FREE" | "PAID";
  certLevel: "BASIC" | "ADVANCED";
  titleEN: string;
  titleZH: string;
  bodyEN: string;
  bodyZH: string;
};

// Deterministic lesson set the catalog test asserts against.
const LESSONS: LessonSeed[] = [
  {
    course: "basic", moduleId: "air-law", slug: "intro-1", order: 1, access: "FREE", certLevel: "BASIC",
    titleEN: "Air Law Basics 1", titleZH: "航空法基础 1",
    bodyEN: "Operate within VLOS at all times.", bodyZH: "始终在 VLOS 视距内操作。",
  },
  {
    course: "basic", moduleId: "air-law", slug: "intro-2", order: 2, access: "FREE", certLevel: "BASIC",
    titleEN: "Air Law Basics 2", titleZH: "航空法基础 2",
    bodyEN: "Know your operating limits.", bodyZH: "了解你的操作限制。",
  },
  {
    course: "basic", moduleId: "meteorology", slug: "wx-1", order: 1, access: "FREE", certLevel: "BASIC",
    titleEN: "Weather 1", titleZH: "气象 1",
    bodyEN: "Clouds matter.", bodyZH: "云很重要。",
  },
  {
    course: "advanced", moduleId: "air-law", slug: "adv-1", order: 1, access: "PAID", certLevel: "ADVANCED",
    titleEN: "Advanced Air Law", titleZH: "高级航空法",
    bodyEN: "Advanced operating environments.", bodyZH: "高级运行环境。",
  },
  {
    course: "advanced", moduleId: "radiotelephony", slug: "rt-1", order: 1, access: "PAID", certLevel: "ADVANCED",
    titleEN: "Radiotelephony", titleZH: "无线电通话",
    bodyEN: "Standard phraseology.", bodyZH: "标准用语。",
  },
];

async function seedLessons(): Promise<number> {
  for (const l of LESSONS) {
    const lessonId = `${l.course}/${l.moduleId}/${l.slug}`;
    const data = {
      lessonId, course: l.course, moduleId: l.moduleId, slug: l.slug, order: l.order,
      estMinutes: 5, certLevel: l.certLevel, access: l.access,
      titleEN: l.titleEN, titleZH: l.titleZH, bodyEN: l.bodyEN, bodyZH: l.bodyZH,
    };
    if (l.course === "basic") await prisma.basicLesson.create({ data });
    else await prisma.advancedLesson.create({ data });
  }
  return LESSONS.length;
}

async function main() {
  const basicQ = await seedBank("basic");
  const advancedQ = await seedBank("advanced");
  const lessons = await seedLessons();
  console.log(`✓ test fixtures — questions: ${basicQ} basic / ${advancedQ} advanced, lessons: ${lessons}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
