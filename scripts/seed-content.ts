/**
 * Seeds a handful of PLACEHOLDER rows into each content table so the app has
 * something to render after the Basic/Advanced split + content reset. Real
 * content is authored later via the admin CMS.
 *
 * Tables: BasicQuestionBank, AdvancedQuestionBank, BasicLesson, AdvancedLesson.
 * Idempotent — upserts throughout, so re-running is safe.
 *
 * Run: pnpm exec tsx scripts/seed-content.ts   (or: pnpm seed:content)
 */
import { prisma } from "../src/lib/db";
import { questionBankPrefix, type ExamCertLevel } from "../src/lib/content/types";

type SeedOption = { optionId: string; labelEN: string; labelZH: string; isCorrect: boolean };
type SeedQuestion = {
  id: string;
  moduleId: string;
  type: "SINGLE";
  selectCount: number;
  difficulty: number;
  stemEN: string;
  stemZH: string;
  explEN: string;
  explZH: string;
  refEN: string;
  refZH: string;
  options: SeedOption[];
};
type SeedLesson = {
  slug: string;
  moduleId: string;
  order: number;
  estMinutes: number;
  certLevel: string;
  access: string;
  titleEN: string;
  titleZH: string;
  bodyEN: string;
  bodyZH: string;
};

const OPTIONS: SeedOption[] = [
  { optionId: "a", labelEN: "Option A", labelZH: "选项 A", isCorrect: true },
  { optionId: "b", labelEN: "Option B", labelZH: "选项 B", isCorrect: false },
  { optionId: "c", labelEN: "Option C", labelZH: "选项 C", isCorrect: false },
  { optionId: "d", labelEN: "Option D", labelZH: "选项 D", isCorrect: false },
];

function placeholderQuestions(level: ExamCertLevel): SeedQuestion[] {
  const label = level === "BASIC" ? "Basic" : "Advanced";
  const prefix = questionBankPrefix(level);
  return [1, 2].map((n) => ({
    id: `${prefix}-air-law-000${n}`,
    moduleId: "air-law",
    type: "SINGLE" as const,
    selectCount: 1,
    difficulty: 1,
    stemEN: `${label} placeholder question ${n}: which option is correct?`,
    stemZH: `${label} 占位题 ${n}：哪个选项正确？`,
    explEN: "Option A is correct (placeholder explanation).",
    explZH: "选项 A 正确（占位解析）。",
    refEN: "Placeholder reference",
    refZH: "占位出处",
    options: OPTIONS,
  }));
}

function placeholderLessons(course: "basic" | "advanced"): SeedLesson[] {
  const certLevel: ExamCertLevel = course === "basic" ? "BASIC" : "ADVANCED";
  const qPrefix = questionBankPrefix(certLevel);
  return [1, 2].map((n) => ({
    slug: `intro-${n}`,
    moduleId: "air-law",
    order: n,
    estMinutes: 5,
    certLevel,
    access: "FREE",
    titleEN: `${course} placeholder lesson ${n}`,
    titleZH: `${course} 占位课 ${n}`,
    bodyEN: `Placeholder ${course} lesson ${n}.\n\n<Checkpoint questionId="${qPrefix}-air-law-000${n}" />\n`,
    bodyZH: `占位 ${course} 课程 ${n}。\n\n<Checkpoint questionId="${qPrefix}-air-law-000${n}" />\n`,
  }));
}

async function seedBasicQuestions(): Promise<number> {
  for (const { id, options, ...scalar } of placeholderQuestions("BASIC")) {
    await prisma.basicQuestionBank.upsert({
      where: { id },
      create: { id, ...scalar, options: { create: options } },
      update: { ...scalar, options: { deleteMany: {}, create: options } },
    });
  }
  return 2;
}

async function seedAdvancedQuestions(): Promise<number> {
  for (const { id, options, ...scalar } of placeholderQuestions("ADVANCED")) {
    await prisma.advancedQuestionBank.upsert({
      where: { id },
      create: { id, ...scalar, options: { create: options } },
      update: { ...scalar, options: { deleteMany: {}, create: options } },
    });
  }
  return 2;
}

async function seedBasicLessons(): Promise<number> {
  for (const lesson of placeholderLessons("basic")) {
    const lessonId = `basic/${lesson.moduleId}/${lesson.slug}`;
    await prisma.basicLesson.upsert({
      where: { lessonId },
      create: { lessonId, course: "basic", ...lesson },
      update: lesson,
    });
  }
  return 2;
}

async function seedAdvancedLessons(): Promise<number> {
  for (const lesson of placeholderLessons("advanced")) {
    const lessonId = `advanced/${lesson.moduleId}/${lesson.slug}`;
    await prisma.advancedLesson.upsert({
      where: { lessonId },
      create: { lessonId, course: "advanced", ...lesson },
      update: lesson,
    });
  }
  return 2;
}

async function main() {
  const bq = await seedBasicQuestions();
  const aq = await seedAdvancedQuestions();
  const bl = await seedBasicLessons();
  const al = await seedAdvancedLessons();
  console.log(
    `✓ seeded placeholders — questions: ${bq} basic / ${aq} advanced, lessons: ${bl} basic / ${al} advanced`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
