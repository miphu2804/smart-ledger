# ADR-0001: Use pgvector on Supabase as the vector store instead of Qdrant

- **Status:** Accepted — the team chose option A (pgvector only) on 2026-09-30
- **Date:** 2026-09-30
- **Owner:** not assigned

## Context

- `FR-019`: RAG retrieves only the selected shop's data and returns the evidence for recommendations and chat.
- `NFR-007`, `AC-012`: vectors and retrieval must be isolated by `shop_id`; a query in shop A does not return shop B's vectors.
- The earlier design chose Qdrant as the vector store but had not settled the use case and had not implemented it.
- PostgreSQL runs on Supabase (staging is shared with dev, production is separate). Verified on staging: PostgreSQL 17.6, and the `vector` 0.8.2 extension is available but not enabled.

## Decision

Store embeddings in PostgreSQL with the `pgvector` extension, in the same database as the business data. Do not deploy Qdrant in the MVP.

- Enable the extension through a versioned migration, not by hand in the Supabase Dashboard.
- Every vector table has a `shop_id` column, and every similarity query filters by `shop_id` in the same SQL statement.
- Do not use Redis: the AI service dropped Redis in PR #467, so pgvector is the only vector store.

## Rationale

| Criterion | pgvector | Qdrant |
|---|---|---|
| `shop_id` isolation | Filtered in SQL, with cross-shop tests using the existing integration tests | The payload must always be tagged and filtered; forgetting the filter leaks data |
| Consistency | Same transaction as `products`; archiving removes entries immediately | Requires syncing Postgres → Qdrant, with a delay |
| Returning evidence | Direct JOIN with business data | An extra Postgres query |
| Backup/schema | Travels with the database and migrations | Separate backup and schema process |
| Operating cost | No extra service or secret | Adds a service, secrets and monitoring for each environment |

## Consequences

- The CI `ai` job uses the `pgvector/pgvector:pg17` image so migrations run the same as on Supabase; the `core` job still uses `postgres:16` because Core migrations do not need the `vector` extension yet.
- Remove Qdrant and `QDRANT__URL` from the design documents.
- Revisit the decision when one of these conditions is measured: p95 similarity query latency exceeds the NFR threshold, the vector count reaches the millions, or hybrid search/quantization is needed that pgvector cannot provide. In that case PostgreSQL stays the source of truth and a dedicated store is only a search replica.
