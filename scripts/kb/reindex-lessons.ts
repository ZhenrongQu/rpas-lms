/**
 * Re-embed course lessons into the RAG knowledge base.
 *
 *   pnpm tsx scripts/kb/reindex-lessons.ts               # full rebuild
 *   pnpm tsx scripts/kb/reindex-lessons.ts --stale-only  # only lessons needing it
 *
 * Pulls Basic/Advanced lessons, chunks + embeds both language bodies, and upserts
 * them via reindexLesson — the SAME updatedAt-guarded write path the CMS uses, so a
 * long bulk run can't clobber a lesson an admin edits mid-run. Requires VOYAGE_API_KEY.
 *
 * `--stale-only` reindexes just the lessons whose index is out of date — no chunks,
 * chunks older than the lesson's updatedAt, or keyword-only chunks (embedding NULL
 * from a degraded CMS reindex). This is the reconcile pass for a CMS `after()`
 * reindex that was dropped (instance crash / timeout) — but NOTHING in this repo
 * schedules it. Until it is wired to a scheduler (e.g. Vercel Cron hitting a
 * protected endpoint), it is a MANUAL ops step, not automatic compensation.
 */
import { prisma } from "../../src/lib/db";
import { voyageConfigured } from "../../src/lib/agents/chat/rag/embed";
import { reindexLesson, ensureVectorIndex } from "./_shared";

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
  // reindexLesson is best-effort (falls back to keyword-only), so guard here to keep
  // this bulk script's "requires VOYAGE_API_KEY" contract loud — an operator running
  // a full rebuild without a key should fail fast, not silently get a vectorless index.
  if (!voyageConfigured()) {
    console.error("VOYAGE_API_KEY is required to (re)build the embedded index.");
    process.exit(1);
  }
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
    // Guarded write: skips if this lesson was edited (and reindexed) after we read it.
    const n = await reindexLesson(l, { requireEmbeddings: true });
    totalChunks += n;
    console.log(`  ${l.lessonId} → ${n} chunks`);
  }

  // Prune orphans: LESSON chunks whose lesson no longer exists. Uses a relational
  // NOT IN (SELECT lessonId ...) evaluated at delete time — not the IDs read at
  // script start — so a lesson created (and indexed) during this run isn't
  // mistaken for an orphan and wiped.
  const pruned = await prisma.$executeRaw`
    DELETE FROM "KnowledgeChunk"
    WHERE source = 'LESSON'
      AND "sourceId" NOT IN (
        SELECT "lessonId" FROM "BasicLesson"
        UNION
        SELECT "lessonId" FROM "AdvancedLesson"
      )`;

  await ensureVectorIndex();
  const did = lessons.length - skipped;
  console.log(
    `✓ reindexed ${did}/${lessons.length} lessons → ${totalChunks} chunks` +
      `${staleOnly ? ` (${skipped} up-to-date, skipped)` : ""} (pruned ${pruned} orphan chunks)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
