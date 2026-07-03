/**
 * Shared indexing helpers for the RAG knowledge-base scripts. The implementation
 * lives in app code (src/lib/agents/chat/rag/ingest.ts) so the admin CMS routes
 * can reuse the exact same indexing logic; this file just re-exports it.
 */
export { indexSource, ensureVectorIndex, deleteSourceChunks } from "../../src/lib/agents/chat/rag/ingest";
export type { SourceInput, LocaleBody } from "../../src/lib/agents/chat/rag/ingest";
