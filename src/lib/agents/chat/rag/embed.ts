/**
 * Voyage AI embedding client for the RAG knowledge base.
 *
 * Anthropic has no first-party embeddings API, so semantic retrieval uses Voyage
 * (Anthropic's recommended partner). We call the REST API directly with `fetch`
 * rather than pulling in an SDK. The model + dimension are fixed here because the
 * pgvector column dimension (KnowledgeChunk.embedding) is pinned to match.
 *
 * Two entry points with different failure modes:
 *  - `embedTexts` throws if the key is missing or the request fails — used by the
 *    ingestion scripts, which must fail loudly (you can't index without vectors).
 *  - `embedQuery` returns `null` on a missing key or failure — used at query time
 *    so retrieval degrades gracefully to keyword-only (mirrors how the chat route
 *    tolerates a missing ANTHROPIC_API_KEY without taking the app down).
 */
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
export const VOYAGE_MODEL = "voyage-3.5";
export const EMBED_DIM = 1024;
// Bound each Voyage request so a hung third-party call can't stall the chat tool
// until the platform kills it. On timeout the fetch aborts and throws; at query
// time embedQuery catches it and falls back to keyword-only.
const REQUEST_TIMEOUT_MS = 10_000;

// Voyage accepts up to 1000 inputs per request; keep batches modest to stay well
// under the per-request token ceiling for long lesson/document chunks.
const MAX_BATCH = 128;

export function voyageConfigured(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

type VoyageResponse = { data: { embedding: number[]; index: number }[] };

async function embedBatch(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: inputType,
      output_dimension: EMBED_DIM,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Voyage embed failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as VoyageResponse;
  // Voyage may return results out of order — sort by index before returning.
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Embed many texts (batched). Throws on missing key or API failure. */
export async function embedTexts(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);
    out.push(...(await embedBatch(batch, inputType)));
  }
  return out;
}

/** Embed a single query. Returns `null` if Voyage is unconfigured or errors, so
 *  the retriever can fall back to keyword-only search instead of failing. */
export async function embedQuery(text: string): Promise<number[] | null> {
  if (!voyageConfigured()) return null;
  try {
    const [vec] = await embedTexts([text], "query");
    return vec ?? null;
  } catch (err) {
    console.error(`[rag] embedQuery failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
