/**
 * One-time, idempotent migration for the checkpoint-bank split (SEC-04).
 *
 * For every lesson body (DB BasicLesson/AdvancedLesson + content/**.mdx source)
 * that still contains an inline `<Checkpoint questionId="X" />`:
 *   1. Upsert a CheckpointQuestion `cp-X` assigned to that lesson, copying the
 *      referenced exam question's content when it still exists (else a
 *      placeholder the admin can edit in the CMS).
 *   2. Strip the inline tag from the body — checkpoints now render at the bottom
 *      of the lesson via the CMS assignment, and `<Checkpoint>` is no longer an
 *      allowed MDX component.
 *
 * Run: pnpm exec tsx scripts/migrate-checkpoints.ts
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";

const TAG = /<Checkpoint\b[^>]*\/>/g;
const QID = /questionId="([^"]+)"/;

type LessonLite = { id: string; lessonId: string; moduleId: string; bodyEN: string; bodyZH: string };
type OptionLite = { optionId: string; labelEN: string; labelZH: string; isCorrect: boolean };

function extractIds(body: string): string[] {
  const ids: string[] = [];
  for (const m of body.matchAll(TAG)) {
    const qid = m[0].match(QID)?.[1];
    if (qid && !ids.includes(qid)) ids.push(qid);
  }
  return ids;
}

function stripTags(body: string): string {
  return body.replace(TAG, "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trimEnd() + "\n";
}

async function findExamQuestion(id: string) {
  const basic = await prisma.basicQuestionBank.findUnique({ where: { id }, include: { options: true } });
  if (basic) return basic;
  return prisma.advancedQuestionBank.findUnique({ where: { id }, include: { options: true } });
}

const PLACEHOLDER_OPTIONS: OptionLite[] = [
  { optionId: "a", labelEN: "A", labelZH: "甲", isCorrect: true },
  { optionId: "b", labelEN: "B", labelZH: "乙", isCorrect: false },
];

async function upsertCheckpointFor(lesson: LessonLite, course: string, qid: string, order: number) {
  const cpId = qid.startsWith("cp-") ? qid : `cp-${qid}`;
  const exam = await findExamQuestion(qid);
  const scalar = exam
    ? {
        type: exam.type,
        selectCount: exam.selectCount,
        stemEN: exam.stemEN,
        stemZH: exam.stemZH,
        explEN: exam.explEN,
        explZH: exam.explZH,
        refEN: exam.refEN,
        refZH: exam.refZH,
        tags: exam.tags,
        mediaKind: exam.mediaKind,
        mediaUrl: exam.mediaUrl,
        mediaAltEN: exam.mediaAltEN,
        mediaAltZH: exam.mediaAltZH,
      }
    : {
        type: "SINGLE",
        selectCount: 1,
        stemEN: "Migrated checkpoint — edit in the CMS.",
        stemZH: "已迁移练习题——请在后台编辑。",
        explEN: "Placeholder explanation.",
        explZH: "占位解析。",
        refEN: "—",
        refZH: "—",
        tags: "[]",
        mediaKind: null,
        mediaUrl: null,
        mediaAltEN: null,
        mediaAltZH: null,
      };
  const options: OptionLite[] = exam?.options.length
    ? exam.options.map((o) => ({ optionId: o.optionId, labelEN: o.labelEN, labelZH: o.labelZH, isCorrect: o.isCorrect }))
    : PLACEHOLDER_OPTIONS;

  const assignment = { lessonId: lesson.lessonId, course, moduleId: lesson.moduleId, order };
  await prisma.checkpointQuestion.upsert({
    where: { id: cpId },
    create: { id: cpId, status: "ACTIVE", ...assignment, ...scalar, options: { create: options } },
    update: { ...assignment, ...scalar, options: { deleteMany: {}, create: options } },
  });
}

async function migrateLessons(
  lessons: LessonLite[],
  course: "basic" | "advanced",
  update: (id: string, bodyEN: string, bodyZH: string) => Promise<unknown>,
): Promise<number> {
  let migrated = 0;
  for (const lesson of lessons) {
    const ids = extractIds(lesson.bodyEN + "\n" + lesson.bodyZH);
    if (ids.length === 0) continue;
    let order = 0;
    for (const qid of ids) {
      await upsertCheckpointFor(lesson, course, qid, order++);
    }
    await update(lesson.id, stripTags(lesson.bodyEN), stripTags(lesson.bodyZH));
    migrated++;
  }
  return migrated;
}

function migrateContentFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) count += migrateContentFiles(p);
    else if (p.endsWith(".mdx")) {
      const txt = readFileSync(p, "utf8");
      if (/<Checkpoint\b[^>]*\/>/.test(txt)) {
        writeFileSync(p, stripTags(txt));
        count++;
      }
    }
  }
  return count;
}

async function main() {
  const select = { id: true, lessonId: true, moduleId: true, bodyEN: true, bodyZH: true };
  const basic = await migrateLessons(
    await prisma.basicLesson.findMany({ select }),
    "basic",
    (id, bodyEN, bodyZH) => prisma.basicLesson.update({ where: { id }, data: { bodyEN, bodyZH } }),
  );
  const advanced = await migrateLessons(
    await prisma.advancedLesson.findMany({ select }),
    "advanced",
    (id, bodyEN, bodyZH) => prisma.advancedLesson.update({ where: { id }, data: { bodyEN, bodyZH } }),
  );
  const files = migrateContentFiles("content/lessons");
  console.log(`✓ checkpoint migration — lessons migrated: ${basic} basic / ${advanced} advanced, source files cleaned: ${files}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
