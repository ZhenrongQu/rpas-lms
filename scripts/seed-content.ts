/**
 * Seeds Question/QuestionOption/Lesson rows from the content files into the DB.
 * Idempotent — uses upsert throughout, so re-running syncs edits.
 *
 * Run: pnpm exec tsx scripts/seed-content.ts   (or: pnpm seed:content)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { loadQuestionBankFromFile } from "../src/lib/content/loadBank";
import { prisma } from "../src/lib/db";
import { FrontmatterSchema, type Course } from "../src/lib/lessons/types";

const LESSONS_ROOT = join(process.cwd(), "content", "lessons");

async function seedQuestions(): Promise<number> {
  const bank = loadQuestionBankFromFile();
  for (const q of bank.questions) {
    const data = {
      moduleId: q.moduleId,
      certLevel: q.certLevel,
      type: q.type,
      selectCount: q.selectCount,
      difficulty: q.difficulty,
      stemEN: q.stem.EN,
      stemZH: q.stem.ZH,
      explEN: q.explanation.EN,
      explZH: q.explanation.ZH,
      refEN: q.reference.EN,
      refZH: q.reference.ZH,
      tags: JSON.stringify(q.tags),
      mediaKind: q.media?.kind ?? null,
      mediaUrl: q.media?.url ?? null,
      mediaAltEN: q.media?.alt.EN ?? null,
      mediaAltZH: q.media?.alt.ZH ?? null,
    };
    const options = q.options.map((o) => ({
      optionId: o.id,
      labelEN: o.label.EN,
      labelZH: o.label.ZH,
      isCorrect: o.isCorrect,
    }));
    await prisma.question.upsert({
      where: { id: q.id },
      create: { id: q.id, ...data, options: { create: options } },
      update: { ...data, options: { deleteMany: {}, create: options } },
    });
  }
  return bank.questions.length;
}

async function seedLessons(): Promise<number> {
  const enRoot = join(LESSONS_ROOT, "en");
  let count = 0;
  for (const course of readdirSync(enRoot)) {
    const courseDir = join(enRoot, course);
    if (!statSync(courseDir).isDirectory()) continue;
    for (const moduleId of readdirSync(courseDir)) {
      const modDir = join(courseDir, moduleId);
      if (!statSync(modDir).isDirectory()) continue;
      for (const file of readdirSync(modDir)) {
        if (!file.endsWith(".mdx")) continue;
        const slug = file.replace(/\.mdx$/, "");
        const en = matter(readFileSync(join(modDir, file), "utf8"));
        const fm = FrontmatterSchema.parse(en.data);

        let titleZH = fm.title;
        let bodyZH = en.content;
        const zhFile = join(LESSONS_ROOT, "zh", course, moduleId, file);
        if (existsSync(zhFile)) {
          const zh = matter(readFileSync(zhFile, "utf8"));
          titleZH = FrontmatterSchema.parse(zh.data).title;
          bodyZH = zh.content;
        }

        const lessonId = `${course}/${moduleId}/${slug}`;
        const data = {
          course: course as Course,
          moduleId,
          slug,
          order: fm.order,
          estMinutes: fm.estMinutes,
          certLevel: fm.certLevel,
          access: fm.access,
          titleEN: fm.title,
          titleZH,
          bodyEN: en.content,
          bodyZH,
        };
        await prisma.lesson.upsert({
          where: { lessonId },
          create: { lessonId, ...data },
          update: data,
        });
        count++;
      }
    }
  }
  return count;
}

async function main() {
  const questions = await seedQuestions();
  const lessons = await seedLessons();
  console.log(`✓ seeded ${questions} questions, ${lessons} lessons`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
