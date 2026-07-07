import { vi, describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../../db";

// Hermetic: the embedder is mocked, so these tests never call Voyage.
vi.mock("./embed", () => ({ embedTexts: vi.fn(), voyageConfigured: vi.fn(), EMBED_DIM: 1024 }));
import { embedTexts, voyageConfigured } from "./embed";
import { indexSource, reindexLesson, deleteSourceChunks } from "./ingest";

const mockedEmbed = vi.mocked(embedTexts);
const mockedConfigured = vi.mocked(voyageConfigured);

function oneHot(index: number): number[] {
  const v = new Array(1024).fill(0);
  v[index % 1024] = 1;
  return v;
}

const PREFIX = "ingest-test-";
const total = (sourceId: string) => prisma.knowledgeChunk.count({ where: { sourceId } });
async function withEmbedding(sourceId: string): Promise<number> {
  const r = await prisma.$queryRaw<{ c: number }[]>`
    SELECT count(*)::int AS c FROM "KnowledgeChunk" WHERE "sourceId" = ${sourceId} AND embedding IS NOT NULL`;
  return r[0]!.c;
}
const contents = (sourceId: string) =>
  prisma.knowledgeChunk.findMany({ where: { sourceId }, select: { content: true } }).then((r) => r.map((x) => x.content));

// reindexLesson's concurrency guard re-reads the lesson row, so tests that call it
// need a real row; beforeEach creates one and records its updatedAt.
let lessonUpdatedAt: Date;
const lesson = (over: Partial<Parameters<typeof reindexLesson>[0]> = {}) => ({
  lessonId: `${PREFIX}lesson`,
  course: "basic",
  moduleId: "air-law",
  certLevel: "BASIC",
  titleEN: "Title",
  titleZH: "标题",
  bodyEN: "Fresh EN body about weather.",
  bodyZH: "关于天气的新内容。",
  updatedAt: lessonUpdatedAt,
  ...over,
});

describe("rag ingest", () => {
  beforeEach(async () => {
    mockedEmbed.mockReset();
    mockedConfigured.mockReset();
    // Default: embeddings succeed, returning valid 1024-dim vectors.
    mockedEmbed.mockImplementation(async (texts: string[]) => texts.map((_, i) => oneHot(i)));
    await prisma.knowledgeChunk.deleteMany({ where: { sourceId: { startsWith: PREFIX } } });
    await prisma.basicLesson.deleteMany({ where: { lessonId: { startsWith: PREFIX } } });
    // Real lesson row for reindexLesson's version guard to re-read.
    const created = await prisma.basicLesson.create({
      data: {
        lessonId: `${PREFIX}lesson`,
        course: "basic",
        moduleId: "air-law",
        slug: `${PREFIX}lesson-slug`,
        order: 98,
        estMinutes: 5,
        certLevel: "BASIC",
        access: "FREE",
        titleEN: "Title",
        titleZH: "标题",
        bodyEN: "Fresh EN body about weather.",
        bodyZH: "关于天气的新内容。",
      },
    });
    lessonUpdatedAt = created.updatedAt;
  });

  afterAll(async () => {
    await prisma.knowledgeChunk.deleteMany({ where: { sourceId: { startsWith: PREFIX } } });
    await prisma.basicLesson.deleteMany({ where: { lessonId: { startsWith: PREFIX } } });
  });

  it("indexSource writes embedded chunks and re-index replaces (no duplicates)", async () => {
    const input = {
      source: "DOCUMENT" as const,
      sourceId: `${PREFIX}a`,
      locales: [{ locale: "EN" as const, title: "T", body: "Alpha about airspace." }],
    };
    expect(await indexSource(input)).toBe(1);
    expect(await total(`${PREFIX}a`)).toBe(1);
    expect(await withEmbedding(`${PREFIX}a`)).toBe(1);

    await indexSource(input); // re-index
    expect(await total(`${PREFIX}a`)).toBe(1); // replaced, not duplicated
  });

  it("indexSource with an empty body clears existing chunks", async () => {
    const base = { source: "DOCUMENT" as const, sourceId: `${PREFIX}b` };
    await indexSource({ ...base, locales: [{ locale: "EN", title: "T", body: "Some content." }] });
    expect(await total(`${PREFIX}b`)).toBe(1);

    expect(await indexSource({ ...base, locales: [{ locale: "EN", title: "T", body: "" }] })).toBe(0);
    expect(await total(`${PREFIX}b`)).toBe(0);
  });

  it("indexSource throws on embed failure without wiping existing chunks (loud, safe)", async () => {
    const input = {
      source: "DOCUMENT" as const,
      sourceId: `${PREFIX}c`,
      locales: [{ locale: "EN" as const, title: "T", body: "Content." }],
    };
    await indexSource(input);
    expect(await total(`${PREFIX}c`)).toBe(1);

    mockedEmbed.mockRejectedValueOnce(new Error("voyage 429"));
    await expect(indexSource(input)).rejects.toThrow(/429/);
    expect(await total(`${PREFIX}c`)).toBe(1); // embed fails before any delete
  });

  it("reindexLesson without Voyage writes keyword-only chunks (fresh content, embedding NULL)", async () => {
    mockedConfigured.mockReturnValue(false);
    await reindexLesson(lesson());
    expect(await total(`${PREFIX}lesson`)).toBe(2); // EN + ZH
    expect(await withEmbedding(`${PREFIX}lesson`)).toBe(0); // keyword-only
    expect(await contents(`${PREFIX}lesson`)).toContain("Fresh EN body about weather.");
    expect(mockedEmbed).not.toHaveBeenCalled();
  });

  it("reindexLesson falls back to keyword-only when embedding throws (corpus preserved)", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedEmbed.mockRejectedValue(new Error("voyage timeout"));
    await reindexLesson(lesson());
    expect(await total(`${PREFIX}lesson`)).toBe(2);
    expect(await withEmbedding(`${PREFIX}lesson`)).toBe(0); // no vectors, but keyword works
    expect(await contents(`${PREFIX}lesson`)).toContain("Fresh EN body about weather.");
  });

  it("reindexLesson attaches embeddings when Voyage works", async () => {
    mockedConfigured.mockReturnValue(true);
    await reindexLesson(lesson());
    expect(await total(`${PREFIX}lesson`)).toBe(2);
    expect(await withEmbedding(`${PREFIX}lesson`)).toBe(2);
  });

  it("reindexLesson with empty bodies removes the lesson's chunks", async () => {
    mockedConfigured.mockReturnValue(true);
    await reindexLesson(lesson());
    expect(await total(`${PREFIX}lesson`)).toBe(2);

    await reindexLesson(lesson({ bodyEN: "", bodyZH: "" }));
    expect(await total(`${PREFIX}lesson`)).toBe(0);
  });

  it("deleteSourceChunks removes a source's chunks", async () => {
    mockedConfigured.mockReturnValue(true);
    await reindexLesson(lesson());
    expect(await total(`${PREFIX}lesson`)).toBe(2);

    await deleteSourceChunks("LESSON", `${PREFIX}lesson`);
    expect(await total(`${PREFIX}lesson`)).toBe(0);
  });

  it("indexSource throws when Voyage returns fewer embeddings than chunks (not silent NULLs)", async () => {
    // 2 locales → 2 chunks, but Voyage returns only 1 vector.
    mockedEmbed.mockResolvedValueOnce([oneHot(0)]);
    const input = {
      source: "DOCUMENT" as const,
      sourceId: `${PREFIX}short`,
      locales: [
        { locale: "EN" as const, title: "T", body: "EN body." },
        { locale: "ZH" as const, title: "T", body: "中文内容。" },
      ],
    };
    await expect(indexSource(input)).rejects.toThrow(/embeddings for 2 chunks/);
    expect(await total(`${PREFIX}short`)).toBe(0); // nothing written
  });

  it("reindexLesson skips a stale (out-of-order) snapshot — older edit can't overwrite newer", async () => {
    mockedConfigured.mockReturnValue(false); // keyword-only; content is what we assert
    const lessonId = `${PREFIX}race`;
    const created = await prisma.basicLesson.create({
      data: {
        lessonId,
        course: "basic",
        moduleId: "air-law",
        slug: `${PREFIX}race-slug`,
        order: 99,
        estMinutes: 5,
        certLevel: "BASIC",
        access: "FREE",
        titleEN: "T",
        titleZH: "标",
        bodyEN: "NEW content",
        bodyZH: "新内容",
      },
    });
    try {
      const base = {
        lessonId,
        course: "basic",
        moduleId: "air-law",
        certLevel: "BASIC",
        titleEN: "T",
        titleZH: "标",
        bodyZH: "新内容",
      };
      // Newer edit (matches current DB updatedAt) → indexes "NEW content".
      await reindexLesson({ ...base, bodyEN: "NEW content", updatedAt: created.updatedAt });
      expect(await contents(lessonId)).toContain("NEW content");

      // Older edit arrives late (stale snapshot) → guard skips it.
      await reindexLesson({
        ...base,
        bodyEN: "OLD content",
        updatedAt: new Date(created.updatedAt.getTime() - 1000),
      });
      const c = await contents(lessonId);
      expect(c).toContain("NEW content");
      expect(c).not.toContain("OLD content");
    } finally {
      await prisma.basicLesson.delete({ where: { lessonId } });
    }
  });

  it("reindexLesson strict mode preserves existing chunks when embedding fails", async () => {
    mockedConfigured.mockReturnValue(true);
    const row = await prisma.basicLesson.create({
      data: {
        lessonId: `${PREFIX}strict`,
        course: "basic",
        moduleId: "air-law",
        slug: `${PREFIX}strict-slug`,
        order: 100,
        estMinutes: 5,
        certLevel: "BASIC",
        access: "FREE",
        titleEN: "T",
        titleZH: "标",
        bodyEN: "Existing indexed content",
        bodyZH: "已有索引内容",
      },
    });
    try {
      await reindexLesson(row);
      mockedEmbed.mockRejectedValueOnce(new Error("voyage 429"));

      await expect(
        reindexLesson(
          { ...row, bodyEN: "Replacement content" },
          { requireEmbeddings: true },
        ),
      ).rejects.toThrow(/429/);
      expect(await contents(row.lessonId)).toContain("Existing indexed content");
      expect(await withEmbedding(row.lessonId)).toBe(2);
    } finally {
      await prisma.basicLesson.delete({ where: { lessonId: row.lessonId } });
      await deleteSourceChunks("LESSON", row.lessonId);
    }
  });

  it("reindexLesson locks the lesson row so an update after the version check cannot be overwritten", async () => {
    mockedConfigured.mockReturnValue(false);
    const row = await prisma.basicLesson.create({
      data: {
        lessonId: `${PREFIX}locked-race`,
        course: "basic",
        moduleId: "air-law",
        slug: `${PREFIX}locked-race-slug`,
        order: 101,
        estMinutes: 5,
        certLevel: "BASIC",
        access: "FREE",
        titleEN: "T",
        titleZH: "标",
        bodyEN: "OLD snapshot",
        bodyZH: "旧快照",
      },
    });
    try {
      // Seed the index with the newer content we must not overwrite.
      await reindexLesson({ ...row, bodyEN: "NEW indexed content" });

      let releaseUpdate!: () => void;
      const holdUpdate = new Promise<void>((resolve) => {
        releaseUpdate = resolve;
      });
      let updateStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        updateStarted = resolve;
      });
      const update = prisma.$transaction(async (tx) => {
        await tx.basicLesson.update({
          where: { lessonId: row.lessonId },
          data: { bodyEN: "NEW database content" },
        });
        updateStarted();
        await holdUpdate;
      });

      await started;
      const staleReindex = reindexLesson({ ...row, bodyEN: "OLD snapshot" });
      await new Promise((resolve) => setTimeout(resolve, 75));
      releaseUpdate();
      await Promise.all([update, staleReindex]);

      const indexed = await contents(row.lessonId);
      expect(indexed).toContain("NEW indexed content");
      expect(indexed).not.toContain("OLD snapshot");
    } finally {
      await prisma.basicLesson.delete({ where: { lessonId: row.lessonId } });
      await deleteSourceChunks("LESSON", row.lessonId);
    }
  });
});
