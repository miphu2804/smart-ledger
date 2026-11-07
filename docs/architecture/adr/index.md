<!-- Kept by hand under the docs rules in AGENTS.md: each entry repeats its document's frontmatter title and description. -->

# Architecture decisions

* [ADR-0001: Use pgvector on Supabase as the vector store instead of Qdrant](0001-vector-store-pgvector.md) - Accepted: embeddings live in Supabase PostgreSQL with pgvector instead of Qdrant.
* [ADR-0002: Agent long-term memory modeled on TencentDB for PostgreSQL, built on Supabase pgvector](0002-agent-long-term-memory.md) - Accepted: pgvector design for agent long-term memory; option A is approved by the product owner and enabled in production through `AGENT_MEMORY_ENABLED`.
* [ADR-0003: Product analytics in Grafana, read from Core and AI data](0003-product-analytics-grafana.md) - Proposed: product usage metrics in Grafana, read from Core and AI data through a read-only role.
* [ADR-0004: The agent reads shop data through model-written, read-only SQL](0004-agent-read-only-text-to-sql.md) - Accepted: the agent reads shop data through model-written, read-only SQL.
* [ADR-0005: Send a fixed window of chat history, never a summary](0005-chat-history-window-without-summary.md) - Accepted: send a fixed window of chat history to the model, never a summary.
* [ADR-0006: Agent guardrails are deterministic code, not model checks](0006-deterministic-agent-guardrails.md) - Accepted: agent guardrails are deterministic code, not model checks.
* [ADR-0007: The code sandbox runs model-written programs, not data tools](0007-sandbox-without-data-tools.md) - Accepted: the code sandbox runs model-written programs but holds no data tools.
* [ADR-0008: Bifrost owns upstream routing and fallback, the AI service only picks an alias](0008-bifrost-owns-routing-and-fallback.md) - Accepted: the AI service picks a model alias; Bifrost owns upstream routing, fallback and content-free request logs.
* [ADR-0009: Trace every Agent chat turn to HoneyHive, redacting sensitive data first](0009-end-to-end-tracing.md) - Accepted for AI: HoneyHive traces each Agent chat turn with redacted content; Core correlation still needs owner approval.
* [ADR-0010: Measure mobile app usage with Google Analytics 4, only with user consent](0010-mobile-usage-analytics-ga4.md) - Proposed: the Android production app sends screen views and a fixed event catalogue to GA4 through Firebase only after the user agrees.
