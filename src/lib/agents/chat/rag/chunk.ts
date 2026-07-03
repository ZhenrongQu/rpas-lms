/**
 * Splits a lesson/document body (raw MDX or plain text) into retrieval chunks.
 *
 * Chunking is paragraph-aware: it accumulates whole paragraphs up to a target
 * size, then carries a small overlap into the next chunk so a fact split across a
 * boundary is still reachable from both sides. Sizes are measured in characters
 * (not tokens) — good enough for chunking and language-agnostic, which matters
 * for the bilingual EN/ZH corpus where a token estimate would skew.
 */
export type ChunkOptions = {
  /** Soft max chunk size in characters (~500–700 tokens for English prose). */
  maxChars?: number;
  /** Characters of trailing context repeated at the start of the next chunk. */
  overlapChars?: number;
};

const DEFAULT_MAX = 2400;
const DEFAULT_OVERLAP = 300;

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/) // blank-line boundaries (markdown paragraphs)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Hard-split a single oversized paragraph on sentence-ish boundaries, falling
// back to a raw character slice so no piece ever exceeds `maxChars`.
function hardSplit(block: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = block;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("。"),
      window.lastIndexOf("\n"),
    );
    const at = cut > maxChars * 0.5 ? cut + 1 : maxChars;
    pieces.push(rest.slice(0, at).trim());
    rest = rest.slice(at);
  }
  if (rest.trim()) pieces.push(rest.trim());
  return pieces;
}

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX;
  const overlapChars = opts.overlapChars ?? DEFAULT_OVERLAP;

  const blocks = splitParagraphs(text).flatMap((b) =>
    b.length > maxChars ? hardSplit(b, maxChars) : [b],
  );

  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > maxChars) {
      chunks.push(current);
      const tail = current.slice(-overlapChars);
      // Start the overlap at a paragraph/sentence break so it reads cleanly.
      const breakAt = tail.search(/\n|(?<=[.。])\s/);
      current = (breakAt >= 0 ? tail.slice(breakAt).trim() : tail).trim();
    }
    current = current ? `${current}\n\n${block}` : block;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
