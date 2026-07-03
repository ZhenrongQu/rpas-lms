/**
 * Re-embed course lessons into the RAG knowledge base.
 *
 *   pnpm tsx scripts/kb/reindex-lessons.ts               # full rebuild
 *   pnpm tsx scripts/kb/reindex-lessons.ts --stale-only  # only lessons needing it
 *
 * Pulls Basic/Advanced lessons, chunks + embeds both language bodies, and upserts
 * them as KnowledgeChunk rows (source = "LESSON"). Idempotent: re-running replaces
 * each lesson's chunks. Requires VOYAGE_API_KEY.
 *
 * `--stale-only` reindexes just the lessons whose index is out of date — no chunks,
 * chunks older than the lesson's updatedAt, or keyword-only chunks (embedding NULL
 * from a degraded CMS reindex). Cheap enough to run on a schedule to compensate for
 * a CMS `after()` reindex that was dropped (instance crash / timeout).
 */
import { prisma } from "../../src/lib/db";
import { indexSource, ensureVectorIndex } from "./_shared";

function cert(level: string): "BASIC" | "ADVANCED" | null {
  return level === "BASIC" ? "BASIC" : level === "ADVANCED" ? "ADVANCED" : null;
}

/** A lesson is stale if it has no chunks, any chunk older than the lesson, or any
 *  keyword-only chunk (embedding NULL) that a Voyage-backed reindex would upgrade. */
async function needsReindex(lessonId: string, updatedAt: Date): Promise<boolean> {
  const [row] = await prisma.$queryRaw<{ total: number; stale: number; nullvec: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE "updatedAt" < ${updatedAt})::int AS stale,
           count(*) FILTER (WHERE embedding IS NULL)::int AS nullvec
    FROM "KnowledgeChunk" WHERE source = 'LESSON' AND "sourceId" = ${lessonId}`;
  return !row || row.total === 0 || row.stale > 0 || row.nullvec > 0;
}

async function main(): Promise<void> {
  const staleOnly = process.argv.includes("--stale-only");
  const [basic, advanced] = await Promise.all([
    prisma.basicLesson.findMany(),
    prisma.advancedLesson.findMany(),
  ]);
  const lessons = [...basic, ...advanced];

  let totalChunks = 0;
  let skipped = 0;
  for (const l of lessons) {
    if (staleOnly && !(await needsReindex(l.lessonId, l.updatedAt))) {
      skipped++;
      continue;
    }
    const n = await indexSource({
      source: "LESSON",
      sourceId: l.lessonId,
      moduleId: l.moduleId,
      certLevel: cert(l.certLevel),
      locales: [
        { locale: "EN", title: l.titleEN, body: l.bodyEN },
        { locale: "ZH", title: l.titleZH, body: l.bodyZH },
      ],
    });
    totalChunks += n;
    console.log(`  ${l.lessonId} → ${n} chunks`);
  }

  // Prune orphans: LESSON chunks whose lesson no longer exists (deleted since the
  // last reindex), so removed course content can't still be retrieved. With no
  // lessons at all, every LESSON chunk is an orphan.
  const currentIds = lessons.map((l) => l.lessonId);
  const orphans = await prisma.knowledgeChunk.deleteMany({
    where:
      currentIds.length > 0
        ? { source: "LESSON", sourceId: { notIn: currentIds } }
        : { source: "LESSON" },
  });

  await ensureVectorIndex();
  const did = lessons.length - skipped;
  console.log(
    `✓ reindexed ${did}/${lessons.length} lessons → ${totalChunks} chunks` +
      `${staleOnly ? ` (${skipped} up-to-date, skipped)` : ""} (pruned ${orphans.count} orphan chunks)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
