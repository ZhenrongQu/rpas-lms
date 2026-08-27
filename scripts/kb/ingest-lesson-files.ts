/**
 * Load authored lesson MDX from content/lessons/ into the Basic/Advanced lesson
 * tables, then embed them into the RAG knowledge base.
 *
 *   pnpm exec tsx scripts/kb/ingest-lesson-files.ts --dry-run   # show the plan
 *   pnpm exec tsx scripts/kb/ingest-lesson-files.ts             # write + reindex
 *
 * Layout: content/lessons/{en,zh}/{course}/{moduleId}/{slug}.mdx — the EN and ZH
 * files for one lesson share the {course}/{moduleId}/{slug} path, which is also
 * the lessonId. Frontmatter (title, order, estMinutes, certLevel, access) is
 * read from the EN file; the ZH file supplies titleZH/bodyZH only.
 *
 * Upserts by lessonId, so re-running is safe and never touches a lesson whose
 * files were removed. Requires VOYAGE_API_KEY for the embedding pass.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { prisma } from "../../src/lib/db";
import { voyageConfigured } from "../../src/lib/agents/chat/rag/embed";
import { reindexLesson, ensureVectorIndex } from "./_shared";
import { guardDbWrite } from "../../src/lib/ops/dbTarget";

const ROOT = join(process.cwd(), "content/lessons");
const DRY = process.argv.includes("--dry-run");

type Parsed = { title: string; order: number; estMinutes: number; certLevel: string; access: string; body: string };
type Lesson = {
  lessonId: string; course: string; moduleId: string; slug: string;
  order: number; estMinutes: number; certLevel: string; access: string;
  titleEN: string; titleZH: string; bodyEN: string; bodyZH: string;
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".mdx") ? [p] : [];
  });
}

function parse(file: string): Parsed {
  const { data, content } = matter(readFileSync(file, "utf8"));
  const need = (k: string) => {
    const v = data[k];
    if (v === undefined || v === null || v === "") throw new Error(`${file}: frontmatter missing "${k}"`);
    return v;
  };
  return {
    title: String(need("title")),
    order: Number(need("order")),
    estMinutes: Number(need("estMinutes")),
    certLevel: String(need("certLevel")),
    access: String(need("access")),
    body: content.trim(),
  };
}

function collect(): Lesson[] {
  // key = "${course}/${moduleId}/${slug}" -> { en?, zh? }
  const byId = new Map<string, { en?: Parsed; zh?: Parsed }>();
  for (const locale of ["en", "zh"] as const) {
    for (const file of walk(join(ROOT, locale))) {
      const rel = file.slice(join(ROOT, locale).length + 1).replace(/\.mdx$/, "");
      const parts = rel.split("/");
      if (parts.length !== 3) throw new Error(`${file}: expected {course}/{moduleId}/{slug}.mdx`);
      const entry = byId.get(rel) ?? {};
      entry[locale] = parse(file);
      byId.set(rel, entry);
    }
  }

  const lessons: Lesson[] = [];
  for (const [lessonId, { en, zh }] of [...byId].sort(([a], [b]) => a.localeCompare(b))) {
    if (!en) throw new Error(`${lessonId}: missing the EN file`);
    if (!zh) throw new Error(`${lessonId}: missing the ZH file`);
    const [course, moduleId, slug] = lessonId.split("/") as [string, string, string];
    lessons.push({
      lessonId, course, moduleId, slug,
      order: en.order, estMinutes: en.estMinutes, certLevel: en.certLevel, access: en.access,
      titleEN: en.title, titleZH: zh.title, bodyEN: en.body, bodyZH: zh.body,
    });
  }
  return lessons;
}

async function main(): Promise<void> {
  guardDbWrite({ dryRun: DRY });
  const lessons = collect();
  const basic = lessons.filter((l) => l.course === "basic");
  const advanced = lessons.filter((l) => l.course === "advanced");

  console.log(`Found ${lessons.length} lessons on disk (${basic.length} basic, ${advanced.length} advanced)\n`);
  for (const l of lessons) {
    const existing =
      l.course === "basic"
        ? await prisma.basicLesson.findUnique({ where: { lessonId: l.lessonId } })
        : await prisma.advancedLesson.findUnique({ where: { lessonId: l.lessonId } });
    console.log(
      `  ${existing ? "UPDATE" : "CREATE"}  ${l.lessonId.padEnd(50)} ` +
        `${l.access.padEnd(4)} EN=${String(l.bodyEN.length).padStart(5)}ch ZH=${String(l.bodyZH.length).padStart(5)}ch`,
    );
  }

  if (DRY) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  if (!voyageConfigured()) {
    console.error("\nVOYAGE_API_KEY is required to embed the lessons.");
    process.exit(1);
  }

  console.log("\nWriting lessons…");
  for (const { lessonId, course, ...rest } of lessons) {
    const model = course === "basic" ? prisma.basicLesson : prisma.advancedLesson;
    // @ts-expect-error both models accept the same lesson shape
    await model.upsert({ where: { lessonId }, create: { lessonId, course, ...rest }, update: rest });
  }

  console.log("Embedding into the knowledge base…");
  let chunks = 0;
  for (const l of [
    ...(await prisma.basicLesson.findMany()),
    ...(await prisma.advancedLesson.findMany()),
  ]) {
    const n = await reindexLesson(l, { requireEmbeddings: true });
    chunks += n;
    console.log(`  ${l.lessonId} → ${n} chunks`);
  }
  await ensureVectorIndex();
  console.log(`\n✓ ${lessons.length} lessons written, ${chunks} chunks indexed.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
