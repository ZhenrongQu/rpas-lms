import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../db";

// Hermetic: the embedder is mocked, so these tests never call Voyage. One-hot
// vectors make the pgvector cosine distances exact — identical one-hot vectors are
// 0 apart, different ones are orthogonal (distance 1) — so a 0.5 cutoff cleanly
// separates "in corpus" from "off corpus".
vi.mock("./embed", () => ({ embedQuery: vi.fn() }));
import { embedQuery } from "./embed";
import { buildScopeProbe, checkScope, scopeMaxDistance, scopeRefusal } from "./scopeGate";

const mockedEmbed = vi.mocked(embedQuery);

function oneHot(index: number): number[] {
  const v = new Array(1024).fill(0);
  v[index] = 1;
  return v;
}

async function insertChunk(sourceId: string, vecIdx: number | null): Promise<void> {
  const embedding = vecIdx === null ? null : `[${oneHot(vecIdx).join(",")}]`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "KnowledgeChunk"
       (id, source, "sourceId", "moduleId", "certLevel", locale, title, content, "chunkIndex", embedding, "updatedAt")
     VALUES ($1, 'DOCUMENT', $2, NULL, NULL, 'EN', 'T', 'body', 0, ${embedding === null ? "NULL" : "$3::vector"}, NOW())`,
    ...(embedding === null ? [randomUUID(), sourceId] : [randomUUID(), sourceId, embedding]),
  );
}

async function seed(): Promise<void> {
  await insertChunk("scope-a", 0);
  await insertChunk("scope-b", 1);
}

// The "corpus_empty" branch needs a table with no embedded rows AT ALL — the gate
// deliberately doesn't filter by locale/cert, so it can't be isolated by scoping a
// query. Back the table up and restore it instead of clearing it: other test files
// (and the global fixture seed) share this database.
type ChunkBackup = {
  id: string;
  source: string;
  sourceId: string;
  moduleId: string | null;
  certLevel: string | null;
  locale: string;
  title: string;
  content: string;
  chunkIndex: number;
  embedding: string | null; // pgvector rendered as text, re-castable with ::vector
};

function backupChunks(): Promise<ChunkBackup[]> {
  return prisma.$queryRaw<ChunkBackup[]>`
    SELECT id, source, "sourceId", "moduleId", "certLevel", locale, title, content,
           "chunkIndex", embedding::text AS embedding
    FROM "KnowledgeChunk"`;
}

async function restoreChunks(rows: ChunkBackup[]): Promise<void> {
  for (const r of rows) {
    const args = [
      r.id, r.source, r.sourceId, r.moduleId, r.certLevel,
      r.locale, r.title, r.content, r.chunkIndex,
    ];
    await prisma.$executeRawUnsafe(
      `INSERT INTO "KnowledgeChunk"
         (id, source, "sourceId", "moduleId", "certLevel", locale, title, content, "chunkIndex", embedding, "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,${r.embedding === null ? "NULL" : "$10::vector"},NOW())`,
      ...(r.embedding === null ? args : [...args, r.embedding]),
    );
  }
}

describe("rag scope gate", () => {
  const original = process.env.SCOPE_MAX_COSINE_DISTANCE;

  beforeAll(async () => {
    await prisma.knowledgeChunk.deleteMany({ where: { sourceId: { startsWith: "scope-" } } });
    await seed();
  });

  afterAll(async () => {
    await prisma.knowledgeChunk.deleteMany({ where: { sourceId: { startsWith: "scope-" } } });
    if (original === undefined) delete process.env.SCOPE_MAX_COSINE_DISTANCE;
    else process.env.SCOPE_MAX_COSINE_DISTANCE = original;
  });

  beforeEach(() => {
    mockedEmbed.mockReset();
    process.env.SCOPE_MAX_COSINE_DISTANCE = "0.5";
  });

  afterEach(() => {
    delete process.env.SCOPE_MAX_COSINE_DISTANCE;
  });

  it("admits everything when the cutoff is unset (gate off by default)", async () => {
    delete process.env.SCOPE_MAX_COSINE_DISTANCE;
    mockedEmbed.mockResolvedValue(oneHot(500)); // orthogonal to the whole corpus
    const v = await checkScope("what is the weather in Vancouver");
    expect(v).toEqual({ inScope: true, reason: "gate_disabled" });
    // The gate being off means it must not even pay for the embedding.
    expect(mockedEmbed).not.toHaveBeenCalled();
  });

  it("admits a question whose nearest chunk is within the cutoff", async () => {
    mockedEmbed.mockResolvedValue(oneHot(0)); // exactly a corpus chunk → distance 0
    const v = await checkScope("what is the maximum altitude");
    expect(v.inScope).toBe(true);
    expect(v).toMatchObject({ reason: "matched" });
    if (v.inScope && v.reason === "matched") expect(v.distance).toBeLessThan(0.5);
  });

  it("refuses a question orthogonal to the whole corpus", async () => {
    mockedEmbed.mockResolvedValue(oneHot(500));
    const v = await checkScope("what is the weather in Vancouver");
    expect(v.inScope).toBe(false);
    if (!v.inScope) expect(v.distance).toBeGreaterThan(0.5);
  });

  it("fails OPEN when the embedder is unavailable", async () => {
    mockedEmbed.mockResolvedValue(null); // no VOYAGE_API_KEY, or the API errored
    const v = await checkScope("what is the weather in Vancouver");
    expect(v).toEqual({ inScope: true, reason: "gate_unavailable" });
  });

  it("fails OPEN when the embedder throws", async () => {
    mockedEmbed.mockRejectedValue(new Error("voyage exploded"));
    const v = await checkScope("what is the weather in Vancouver");
    expect(v).toEqual({ inScope: true, reason: "gate_unavailable" });
  });

  it("fails OPEN on an empty probe", async () => {
    const v = await checkScope("   ");
    expect(v).toEqual({ inScope: true, reason: "gate_unavailable" });
    expect(mockedEmbed).not.toHaveBeenCalled();
  });

  it("fails OPEN when no chunk is embedded (keyword-only corpus)", async () => {
    const backup = await backupChunks();
    try {
      await prisma.knowledgeChunk.deleteMany();
      await insertChunk("scope-null", null); // present, but embedding IS NULL
      mockedEmbed.mockResolvedValue(oneHot(500));
      const v = await checkScope("what is the weather in Vancouver");
      expect(v).toEqual({ inScope: true, reason: "corpus_empty" });
    } finally {
      await prisma.knowledgeChunk.deleteMany();
      await restoreChunks(backup);
    }
  });

  describe("scopeMaxDistance", () => {
    it.each([
      ["blank", "   "],
      ["not a number", "abc"],
      ["negative", "-1"],
      ["above the cosine range", "2.5"],
    ])("returns null (gate off) for %s", (_label, raw) => {
      expect(scopeMaxDistance(raw)).toBeNull();
    });

    it("returns null when the env var is unset", () => {
      delete process.env.SCOPE_MAX_COSINE_DISTANCE;
      expect(scopeMaxDistance()).toBeNull();
    });

    it("parses a valid cutoff", () => {
      expect(scopeMaxDistance("0.85")).toBe(0.85);
    });
  });

  describe("buildScopeProbe", () => {
    it("anchors a bare follow-up with the previous user turn", () => {
      const probe = buildScopeProbe([
        { role: "user", content: "what is the altitude limit for Basic operations" },
        { role: "assistant", content: "122 m AGL." },
        { role: "user", content: "why?" },
      ]);
      expect(probe).toContain("altitude limit");
      expect(probe).toContain("why?");
    });

    it("ignores assistant turns, so a drifted answer can't justify the next question", () => {
      const probe = buildScopeProbe([
        { role: "user", content: "hi" },
        { role: "assistant", content: "long off-topic reply about cooking" },
        { role: "user", content: "and the weather?" },
      ]);
      expect(probe).not.toContain("cooking");
    });

    it("keeps the newest message when truncating", () => {
      const probe = buildScopeProbe([
        { role: "user", content: "x".repeat(2000) },
        { role: "user", content: "the newest question" },
      ]);
      expect(probe.length).toBeLessThanOrEqual(600);
      expect(probe).toContain("the newest question");
    });
  });

  it("refuses without naming the topic the student asked about", () => {
    for (const locale of ["EN", "ZH"] as const) {
      const msg = scopeRefusal(locale);
      expect(msg).not.toMatch(/weather|天气/i);
      expect(msg.length).toBeGreaterThan(40);
    }
  });
});
