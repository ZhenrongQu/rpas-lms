import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../db";

// Hermetic: the embedder is mocked, so these tests never call Voyage. The query
// vector is set per-test to steer the pgvector cosine branch deterministically.
vi.mock("./embed", () => ({ embedQuery: vi.fn() }));
import { embedQuery } from "./embed";
import { maxCosineDistance, retrieve } from "./retrieve";

const mockedEmbed = vi.mocked(embedQuery);

function oneHot(index: number): number[] {
  const v = new Array(1024).fill(0);
  v[index] = 1;
  return v;
}

async function insertChunk(o: {
  sourceId: string;
  locale: "EN" | "ZH";
  title: string;
  content: string;
  vecIdx: number;
}): Promise<void> {
  const lit = `[${oneHot(o.vecIdx).join(",")}]`;
  await prisma.$executeRaw`
    INSERT INTO "KnowledgeChunk"
      (id, source, "sourceId", "moduleId", "certLevel", locale, title, content, "chunkIndex", embedding, "updatedAt")
    VALUES
      (${randomUUID()}, ${"DOCUMENT"}, ${o.sourceId}, ${null}, ${null},
       ${o.locale}, ${o.title}, ${o.content}, ${0}, ${lit}::vector, NOW())`;
}

describe("rag hybrid retrieval", () => {
  beforeAll(async () => {
    await prisma.knowledgeChunk.deleteMany({ where: { sourceId: { startsWith: "rag-" } } });
    await insertChunk({ sourceId: "rag-a", locale: "EN", title: "Alpha", content: "topic about airspace classes", vecIdx: 0 });
    await insertChunk({ sourceId: "rag-b", locale: "EN", title: "Beta", content: "topic about weather and clouds", vecIdx: 1 });
    await insertChunk({ sourceId: "rag-c", locale: "EN", title: "Gamma", content: "topic about navigation charts", vecIdx: 2 });
    await insertChunk({ sourceId: "rag-z", locale: "ZH", title: "空域", content: "关于 管制空域 的中文文档", vecIdx: 3 });
    await insertChunk({ sourceId: "rag-mixed", locale: "ZH", title: "RPAS", content: "RPAS classification", vecIdx: 4 });
  });

  afterAll(async () => {
    await prisma.knowledgeChunk.deleteMany({ where: { sourceId: { startsWith: "rag-" } } });
  });

  beforeEach(() => mockedEmbed.mockReset());

  it("semantic branch ranks the vector-nearest chunk to the top", async () => {
    // Query embedding equals rag-b's vector → it should win despite all three
    // sharing the keyword "topic".
    mockedEmbed.mockResolvedValue(oneHot(1));
    const hits = await retrieve("topic", { locale: "EN" });
    expect(hits[0]!.sourceId).toBe("rag-b");
  });

  it("filters by locale — an EN query never returns a ZH-only chunk", async () => {
    // Query vector matches rag-z exactly, but rag-z is ZH and the query is EN.
    mockedEmbed.mockResolvedValue(oneHot(3));
    const hits = await retrieve("airspace", { locale: "EN" });
    expect(hits.every((h) => h.sourceId !== "rag-z")).toBe(true);
  });

  it("degrades to keyword-only when the query can't be embedded", async () => {
    mockedEmbed.mockResolvedValue(null); // no VOYAGE_API_KEY / API error
    const hits = await retrieve("weather", { locale: "EN" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.sourceId === "rag-b")).toBe(true); // "weather" is in rag-b
  });

  it("keyword fallback extracts Chinese phrases from a natural-language question", async () => {
    mockedEmbed.mockResolvedValue(null);
    const hits = await retrieve("什么是管制空域", { locale: "ZH" });
    expect(hits.some((h) => h.sourceId === "rag-z")).toBe(true);
  });

  it("keyword fallback keeps a core Chinese term at the end of a long question", async () => {
    mockedEmbed.mockResolvedValue(null);
    const hits = await retrieve("请详细解释无人机飞行过程中什么情况下属于管制空域", { locale: "ZH" });
    expect(hits.some((h) => h.sourceId === "rag-z")).toBe(true);
  });

  it("keyword fallback samples a core Chinese term from the middle of a long question", async () => {
    mockedEmbed.mockResolvedValue(null);
    const hits = await retrieve("请详细说明无人机飞行准备流程管制空域以及天气评估和应急程序", { locale: "ZH" });
    expect(hits.some((h) => h.sourceId === "rag-z")).toBe(true);
  });

  it("keyword fallback preserves Latin terms in text without spaces around Chinese", async () => {
    mockedEmbed.mockResolvedValue(null);
    const hits = await retrieve("RPAS的定义", { locale: "ZH" });
    expect(hits.some((h) => h.sourceId === "rag-mixed")).toBe(true);
  });

  it("parses a configurable cosine-distance threshold with safe fallback", () => {
    expect(maxCosineDistance(undefined)).toBe(0.65);
    expect(maxCosineDistance("0.8")).toBe(0.8);
    expect(maxCosineDistance("nope")).toBe(0.65);
    expect(maxCosineDistance("-1")).toBe(0.65);
    expect(maxCosineDistance("2.1")).toBe(0.65);
  });

  it("returns nothing when neither branch matches", async () => {
    mockedEmbed.mockResolvedValue(null);
    const hits = await retrieve("zzzznonexistentterm", { locale: "EN" });
    expect(hits).toEqual([]);
  });

  it("applies a distance threshold — an embeddable but irrelevant query returns nothing", async () => {
    // Vector is orthogonal to every seeded chunk (cosine distance 1.0 > threshold)
    // and the term matches nothing lexically → the empty path must fire.
    mockedEmbed.mockResolvedValue(oneHot(500));
    const hits = await retrieve("zzzznonexistentterm", { locale: "EN" });
    expect(hits).toEqual([]);
  });

  it("degrades to keyword when the vector branch throws (not just when embed is null)", async () => {
    // A wrong-dimension vector makes the pgvector query throw; keyword must still work.
    mockedEmbed.mockResolvedValue([1, 0, 0]);
    const hits = await retrieve("weather", { locale: "EN" });
    expect(hits.some((h) => h.sourceId === "rag-b")).toBe(true);
  });

  it("throws when BOTH branches fail instead of reporting no results", async () => {
    mockedEmbed.mockResolvedValue(oneHot(1)); // vector branch will run its SQL
    const spy = vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("db down"));
    await expect(retrieve("weather", { locale: "EN" })).rejects.toThrow(/retrieval failed/);
    spy.mockRestore();
  });

  it("throws when a branch fails and the only surviving branch is empty (Voyage off + DB fault)", async () => {
    // Vector fulfils with [] (embed null → no SQL); keyword SQL rejects. Returning
    // [] here would falsely say "no material" while hiding a real DB fault.
    mockedEmbed.mockResolvedValue(null);
    const spy = vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("db down"));
    await expect(retrieve("weather", { locale: "EN" })).rejects.toThrow(/retrieval failed/);
    spy.mockRestore();
  });
});
