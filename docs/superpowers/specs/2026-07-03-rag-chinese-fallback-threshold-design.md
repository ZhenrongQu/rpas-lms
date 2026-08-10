# RAG Chinese Fallback and Threshold Design

## Scope

Fix two retrieval-quality gaps without changing the RAG storage model or adding dependencies:

1. Chinese natural-language queries must still retrieve useful course passages when Voyage embeddings are unavailable.
2. The vector cosine-distance cutoff must be adjustable without a code deployment while retaining a safe default.

## Design

### Chinese keyword fallback

Keep the existing whitespace tokenization for Latin text. For each contiguous CJK sequence, also generate overlapping 2-, 3-, and 4-character n-grams. Deduplicate terms and retain the existing 12-term cap so generated SQL remains bounded.

Example: `什么是管制空域` produces terms including `管制`, `管制空`, and `管制空域`, allowing content containing the core phrase to match even when the full question does not appear verbatim.

### Vector threshold

Read `RAG_MAX_COSINE_DISTANCE` at query time. Accept only finite numbers in the pgvector cosine-distance range `0..2`; otherwise use the current default `0.65`. This keeps existing behavior unchanged by default and permits corpus-specific tuning through deployment configuration.

## Error handling

- Invalid threshold configuration falls back to `0.65`; it must not take chat retrieval down.
- Empty or punctuation-only queries continue to produce no keyword candidates.
- Term generation remains capped and deduplicated.

## Tests

- With embeddings disabled, a Chinese natural-language question retrieves a chunk containing its core term.
- Latin whitespace tokenization continues to work.
- Default, valid configured, non-numeric, and out-of-range threshold values resolve correctly.

## Out of scope

- Adding a Chinese segmentation dependency.
- Selecting the production threshold without real EN/ZH evaluation data.
- Changing RRF ranking or database indexes.
