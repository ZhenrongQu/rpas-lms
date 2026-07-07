/**
 * Hybrid retrieval over the KnowledgeChunk corpus for the chat assistant.
 *
 * Two independent branches, fused by Reciprocal Rank Fusion (RRF):
 *  - Vector: embed the query (Voyage) and rank by pgvector cosine distance. Best
 *    for meaning, paraphrase, and cross-lingual matches.
 *  - Keyword: substring term-scoring (the pre-RAG behavior, kept). Best for exact
 *    matches — regulation numbers, module ids, specific terms — including Chinese
 *    substrings that a semantic model might smear over.
 *
 * If the query can't be embedded (no VOYAGE_API_KEY, or the API errors), the
 * vector branch yields nothing and results come from the keyword branch alone —
 * the assistant stays useful instead of failing.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../../db";
import { embedQuery } from "./embed";

export type RetrievedChunk = {
  id: string;
  source: string; // "LESSON" | "DOCUMENT"
  sourceId: string;
  moduleId: string | null;
  title: string;
  content: string;
};

export type RetrieveOptions = {
  locale: "EN" | "ZH";
  certLevel?: "BASIC" | "ADVANCED" | null;
  /** Final number of chunks to return. */
  k?: number;
};

// Candidates pulled per branch before fusion, and the RRF damping constant (60 is
// the standard value from the original RRF paper).
const CANDIDATE_N = 10;
const RRF_K = 60;
// Keyword candidates fetched from SQL before JS refinement. Ordered by a relevance
// proxy so the cut keeps the best matches even when many chunks match.
const KEYWORD_CANDIDATE_N = 100;
// pgvector `<=>` is cosine distance in [0,2] (0 = identical, 1 = orthogonal). Drop
// vector hits beyond this so an off-topic query returns nothing instead of the
// "nearest" but irrelevant chunks. Starting default — tune against real Voyage
// distances once the corpus is embedded.
const DEFAULT_MAX_COSINE_DISTANCE = 0.65;

export function maxCosineDistance(raw = process.env.RAG_MAX_COSINE_DISTANCE): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_COSINE_DISTANCE;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2
    ? parsed
    : DEFAULT_MAX_COSINE_DISTANCE;
}

function certFilter(certLevel?: "BASIC" | "ADVANCED" | null): Prisma.Sql {
  // A requested cert level still includes cert-agnostic documents (certLevel null).
  return certLevel
    ? Prisma.sql`AND ("certLevel" = ${certLevel} OR "certLevel" IS NULL)`
    : Prisma.empty;
}

async function vectorSearch(query: string, opts: RetrieveOptions): Promise<RetrievedChunk[]> {
  const vec = await embedQuery(query);
  if (!vec) return [];
  // Numbers only — safe to bind as a text literal and cast to pgvector.
  const literal = `[${vec.join(",")}]`;
  const maxDistance = maxCosineDistance();
  return prisma.$queryRaw<RetrievedChunk[]>`
    SELECT id, source, "sourceId", "moduleId", title, content
    FROM "KnowledgeChunk"
    WHERE locale = ${opts.locale} AND embedding IS NOT NULL
      AND embedding <=> ${literal}::vector < ${maxDistance}
      ${certFilter(opts.certLevel)}
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${CANDIDATE_N}`;
}

function terms(query: string): string[] {
  const normalized = query.toLowerCase();
  const cjkRuns = normalized.match(/[\u3400-\u9fff]+/gu) ?? [];
  const latin = (normalized.match(/[a-z0-9]+(?:[._/-][a-z0-9]+)*/g) ?? []).filter(
    (t) => t.length >= 2,
  );
  // Reserve room for CJK terms in mixed-language queries; English-only queries
  // retain the full candidate budget.
  const maxTerms = 24;
  const out = new Set(latin.slice(0, cjkRuns.length > 0 ? 6 : maxTerms));
  const bySize = new Map<number, string[]>([[2, []], [3, []], [4, []]]);
  for (const size of [2, 3, 4]) {
    const candidates = bySize.get(size)!;
    for (const run of cjkRuns) {
      for (let i = 0; i <= run.length - size; i++) candidates.push(run.slice(i, i + size));
    }
  }

  const remaining = maxTerms - out.size;
  const quotas = new Map<number, number>([
    [2, Math.ceil(remaining / 2)],
    [3, Math.ceil(remaining / 4)],
    [4, Math.floor(remaining / 4)],
  ]);
  for (const size of [2, 3, 4]) {
    const candidates = [...new Set(bySize.get(size)!)];
    const count = Math.min(quotas.get(size)!, candidates.length);
    for (let i = 0; i < count && out.size < maxTerms; i++) {
      const index = count === 1 ? 0 : Math.round((i * (candidates.length - 1)) / (count - 1));
      out.add(candidates[index]!);
    }
  }
  return [...out];
}

async function keywordSearch(query: string, opts: RetrieveOptions): Promise<RetrievedChunk[]> {
  const ts = terms(query);
  if (ts.length === 0) return [];

  // Coarse filter in SQL (any term hits title/content/module), then refine in JS.
  // Ordering the candidates by a weighted match score before the LIMIT ensures the
  // most relevant rows survive the cut even when far more than the cap match — an
  // unordered LIMIT could drop the best results for a large corpus.
  // Use strpos (plain substring search) rather than LIKE so a term containing %
  // or _ can't act as a wildcard and match unrelated rows. Terms are already
  // lower-cased; lower() both sides for case-insensitive matching.
  const anyTerm = Prisma.join(
    ts.map(
      (t) =>
        Prisma.sql`(strpos(lower(title), ${t}) > 0 OR strpos(lower(content), ${t}) > 0 OR strpos(lower(coalesce("moduleId", '')), ${t}) > 0)`,
    ),
    " OR ",
  );
  // Per-term: title/module hit weighs 5, content hit 1 (matches the JS refinement
  // below, minus frequency which SQL can't cheaply count).
  const matchScore = Prisma.join(
    ts.map(
      (t) =>
        Prisma.sql`(CASE WHEN strpos(lower(title), ${t}) > 0 OR strpos(lower(coalesce("moduleId", '')), ${t}) > 0 THEN 5 ELSE 0 END + CASE WHEN strpos(lower(content), ${t}) > 0 THEN 1 ELSE 0 END)`,
    ),
    " + ",
  );
  const rows = await prisma.$queryRaw<RetrievedChunk[]>`
    SELECT id, source, "sourceId", "moduleId", title, content
    FROM "KnowledgeChunk"
    WHERE locale = ${opts.locale} ${certFilter(opts.certLevel)} AND (${anyTerm})
    ORDER BY (${matchScore}) DESC
    LIMIT ${KEYWORD_CANDIDATE_N}`;

  return rows
    .map((row) => {
      const module = (row.moduleId ?? "").toLowerCase();
      const title = row.title.toLowerCase();
      const hay = `${module} ${title} ${row.content}`.toLowerCase();
      let score = 0;
      for (const t of ts) {
        // Module/title hits weigh more than body hits (matches the pre-RAG scorer).
        if (module.includes(t) || title.includes(t)) score += 5;
        score += hay.split(t).length - 1;
      }
      return { row, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_N)
    .map((s) => s.row);
}

function rrfFuse(lists: RetrievedChunk[][]): RetrievedChunk[] {
  const acc = new Map<string, { chunk: RetrievedChunk; score: number }>();
  for (const list of lists) {
    list.forEach((chunk, rank) => {
      const add = 1 / (RRF_K + rank + 1);
      const prev = acc.get(chunk.id);
      if (prev) prev.score += add;
      else acc.set(chunk.id, { chunk, score: add });
    });
  }
  return [...acc.values()].sort((a, b) => b.score - a.score).map((e) => e.chunk);
}

/** Hybrid semantic + keyword retrieval, fused by RRF. Returns the top `k` chunks.
 *  A branch failing degrades to the other ONLY when the other actually produced
 *  results. If a branch failed and every surviving branch is empty, we can't tell
 *  "genuinely no match" from "the branch that would have matched errored" — so we
 *  throw and let the tool surface the fault, rather than return [] and falsely
 *  report "no material matched". (Covers e.g. Voyage-off → vector fulfils with [],
 *  keyword SQL rejects on a DB fault.) */
export async function retrieve(query: string, opts: RetrieveOptions): Promise<RetrievedChunk[]> {
  const k = opts.k ?? 4;
  const settled = await Promise.allSettled([vectorSearch(query, opts), keywordSearch(query, opts)]);

  const lists: RetrievedChunk[][] = [];
  const failures: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      lists.push(r.value);
      return;
    }
    const branch = i === 0 ? "vector" : "keyword";
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    console.error(`[rag] ${branch} branch failed: ${msg}`);
    failures.push(`${branch}: ${msg}`);
  });

  if (failures.length > 0 && lists.every((l) => l.length === 0)) {
    throw new Error(`retrieval failed — ${failures.join("; ")}`);
  }
  return rrfFuse(lists).slice(0, k);
}
