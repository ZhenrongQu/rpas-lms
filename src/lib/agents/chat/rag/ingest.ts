/**
 * Knowledge-base indexing for the RAG corpus (KnowledgeChunk). App-level code so
 * both the ingestion scripts (scripts/kb/*) and the admin CMS routes can keep the
 * index consistent with the lesson/document tables.
 *
 * The embedding column is a pgvector `vector` type, which the Prisma client can't
 * write through its typed API — rows are inserted with raw SQL, binding the vector
 * as a `'[...]'::vector` literal (or NULL for a keyword-only row). Embeddings come
 * from Voyage; `embedTexts` throws if VOYAGE_API_KEY is missing.
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../db";
import { chunkText } from "./chunk";
import { embedTexts, EMBED_DIM, voyageConfigured } from "./embed";

export type LocaleBody = { locale: "EN" | "ZH"; title: string; body: string };

export type SourceInput = {
  source: "LESSON" | "DOCUMENT";
  sourceId: string;
  moduleId?: string | null;
  certLevel?: "BASIC" | "ADVANCED" | null;
  locales: LocaleBody[];
};

type ChunkJob = { locale: "EN" | "ZH"; title: string; chunkIndex: number; content: string };

function chunkJobs(input: SourceInput): ChunkJob[] {
  return input.locales.flatMap((loc) =>
    chunkText(loc.body).map((content, chunkIndex) => ({
      locale: loc.locale,
      title: loc.title,
      chunkIndex,
      content,
    })),
  );
}

function chunkWhere(input: SourceInput) {
  return {
    source: input.source,
    sourceId: input.sourceId,
    locale: { in: input.locales.map((l) => l.locale) },
  };
}

// One INSERT as a composable Prisma.Sql. `vec === null` writes a keyword-only
// chunk (embedding NULL); the vector branch skips those (`embedding IS NOT NULL`).
function buildInsert(input: SourceInput, job: ChunkJob, vec: number[] | null): Prisma.Sql {
  const embedding = vec ? Prisma.sql`${`[${vec.join(",")}]`}::vector` : Prisma.sql`NULL`;
  return Prisma.sql`
    INSERT INTO "KnowledgeChunk"
      (id, source, "sourceId", "moduleId", "certLevel", locale, title, content, "chunkIndex", embedding, "updatedAt")
    VALUES
      (${randomUUID()}, ${input.source}, ${input.sourceId}, ${input.moduleId ?? null},
       ${input.certLevel ?? null}, ${job.locale}, ${job.title}, ${job.content}, ${job.chunkIndex},
       ${embedding}, NOW())`;
}

/** Reject a Voyage batch that doesn't line up 1:1 with the chunks (short/oversized
 *  response or a wrong-dimension vector) — otherwise missing positions would be
 *  silently written as NULL and reported as success. */
function assertVectorsMatch(vectors: number[][], jobCount: number): void {
  if (vectors.length !== jobCount) {
    throw new Error(`Voyage returned ${vectors.length} embeddings for ${jobCount} chunks`);
  }
  vectors.forEach((vec, i) => {
    if (vec.length !== EMBED_DIM) {
      throw new Error(`unexpected embedding dim ${vec.length} (expected ${EMBED_DIM}) at chunk ${i}`);
    }
  });
}

/** Remove a source item's chunks (optionally scoped to specific locales). */
export async function deleteSourceChunks(
  source: "LESSON" | "DOCUMENT",
  sourceId: string,
  locales?: ("EN" | "ZH")[],
): Promise<void> {
  await prisma.knowledgeChunk.deleteMany({
    where: { source, sourceId, ...(locales ? { locale: { in: locales } } : {}) },
  });
}

/** Chunk + embed + (re)insert all chunks for one source item. Replaces only the
 *  locales being written, so EN and ZH can be ingested independently. Throws if
 *  embeddings can't be produced or don't line up with the chunks — the bulk
 *  scripts must fail loudly, not silently index without vectors. Clears-then-writes
 *  even when the body is now empty, so a retracted source leaves no stale chunks. */
export async function indexSource(input: SourceInput): Promise<number> {
  const jobs = chunkJobs(input);
  if (jobs.length === 0) {
    await deleteSourceChunks(input.source, input.sourceId, input.locales.map((l) => l.locale));
    return 0;
  }
  const vectors = await embedTexts(
    jobs.map((j) => j.content),
    "document",
  );
  assertVectorsMatch(vectors, jobs.length);

  const inserts = jobs.map((j, i) => prisma.$executeRaw(buildInsert(input, j, vectors[i]!)));
  await prisma.$transaction([
    prisma.knowledgeChunk.deleteMany({ where: chunkWhere(input) }),
    ...inserts,
  ]);
  return jobs.length;
}

export type LessonRow = {
  lessonId: string;
  course: string; // "basic" | "advanced"
  moduleId: string;
  certLevel: string;
  titleEN: string;
  titleZH: string;
  bodyEN: string;
  bodyZH: string;
  updatedAt: Date;
};

/** Refresh one lesson's chunks after a CMS create/edit, so the assistant never
 *  cites a stale version. Always writes CURRENT content; embeddings are attached
 *  when Voyage is available and omitted (embedding NULL) when it is not — the
 *  keyword branch keeps working on fresh content while the vector branch skips
 *  this lesson until a later successful (re)index.
 *
 *  Concurrency-safe: the write runs in a transaction that first re-checks the
 *  lesson's `updatedAt` against the snapshot this call was built from. If a newer
 *  edit has landed (or the lesson was deleted), this reindex is stale and skips —
 *  so a slow reindex can't clobber a newer one written before it (the race the
 *  async `after()` scheduling would otherwise allow). Best-effort: callers must
 *  not fail the admin write on a RAG error. */
export async function reindexLesson(lesson: LessonRow): Promise<void> {
  const certLevel =
    lesson.certLevel === "BASIC" ? "BASIC" : lesson.certLevel === "ADVANCED" ? "ADVANCED" : null;
  const input: SourceInput = {
    source: "LESSON",
    sourceId: lesson.lessonId,
    moduleId: lesson.moduleId,
    certLevel,
    locales: [
      { locale: "EN", title: lesson.titleEN, body: lesson.bodyEN },
      { locale: "ZH", title: lesson.titleZH, body: lesson.bodyZH },
    ],
  };
  const jobs = chunkJobs(input);

  // Embed outside the transaction (slow); default to keyword-only.
  let vectors: (number[] | null)[] = jobs.map(() => null);
  if (jobs.length > 0 && voyageConfigured()) {
    try {
      const embedded = await embedTexts(
        jobs.map((j) => j.content),
        "document",
      );
      assertVectorsMatch(embedded, jobs.length);
      vectors = embedded;
    } catch (err) {
      console.error(
        `[rag] reindexLesson ${lesson.lessonId}: embedding failed, indexing keyword-only: ${err instanceof Error ? err.message : String(err)}`,
      );
      // vectors stays all-null → content refreshed, vector search skips it.
    }
  }

  const where = chunkWhere(input);
  const inserts = jobs.map((j, i) => buildInsert(input, j, vectors[i]!));
  await prisma.$transaction(async (tx) => {
    const current =
      lesson.course === "basic"
        ? await tx.basicLesson.findUnique({ where: { lessonId: lesson.lessonId }, select: { updatedAt: true } })
        : await tx.advancedLesson.findUnique({ where: { lessonId: lesson.lessonId }, select: { updatedAt: true } });
    // Superseded by a newer edit (or lesson deleted) → that edit owns the index.
    if (!current || current.updatedAt.getTime() !== lesson.updatedAt.getTime()) return;

    await tx.knowledgeChunk.deleteMany({ where });
    for (const insert of inserts) await tx.$executeRaw(insert);
  });
}

/** Create the HNSW cosine index (idempotent). Optional for small corpora. */
export async function ensureVectorIndex(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embedding_hnsw" ` +
      `ON "KnowledgeChunk" USING hnsw (embedding vector_cosine_ops)`,
  );
}
