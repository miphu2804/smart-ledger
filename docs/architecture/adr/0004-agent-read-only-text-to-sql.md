# ADR-0004: The agent reads shop data through model-written, read-only SQL

- **Status:** Accepted, recorded after the fact; merged in #77 on 2026-10-02
- **Date:** 2026-10-30
- **Owner:** not assigned

## Context

- The owner asks free-form questions about their shop's figures (`FR-020`). The AI must not change data (`NFR-006`), and an answer must never include another shop's data (`NFR-007`, `AC-012`).
- #23 planned a `POST /internal/v1/agent/sql` endpoint. Issue #76 replaced it with a tool inside the agent, so Core and mobile connect to one chat endpoint and there is no SQL endpoint to attack.
- The agent runs a small model. The owner cannot review SQL before it runs.

## Decision

The agent gets one tool, `query_shop_data(sql)`, that runs one model-written `SELECT`. Five independent layers bound what that query can do:

| Layer | Bound |
|---|---|
| Role | `ai_sql_reader` (`NOLOGIN`) can `SELECT` only from the `ai_read` views; no grant on Core's tables |
| Views | Each view filters on the transaction setting `smartledger.shop_id`, hides `shop_id` and leaves out PII; an unset setting returns no rows |
| Guard | `SqlGuard` parses with `sqlglot`, accepts one `SELECT` over the views with allowlisted functions and casts, and runs its own re-rendering under `LIMIT` |
| Execution | Separate pool, `READ ONLY` transaction, shop id bound from the request, statement timeout, row cap |
| Output | Results reach the model as data; rejected queries return `Error[CODE]` so the model can rewrite them |

The model passes only `sql`; the shop comes from the request context, never from the model. Questions with a fixed answer shape get their own tool with a fixed query (`suggest_restock`, #106) that runs through the same guard and pool.

## Options considered

| Option | Outcome |
|---|---|
| SQL HTTP endpoint (#23) | Rejected: a second public-facing surface for the same capability |
| Model-based query checker or human approval of SQL | Rejected: the owner cannot judge SQL, each step adds a model call, and the role, views and guard already bound the risk |
| One fixed tool per question | Not compared in #76 or #77; used only where the shape is fixed, as with restock |

## Consequences

- Isolation does not depend on the model or the prompt. The integration test proves that a failing cast cannot quote another shop's row only because the views are `security_barrier`; removing that option fails the test.
- Every new kind of data needs a migration (a view and its grant) and a guard allowlist change. Customer names and contacts, expense descriptions, refunds and stock-in history are not exposed yet.
- Functions outside the allowlist, such as `to_char` or regex `~`, are rejected, and the model has to rewrite the query. The allowlist may need to grow after measuring with real questions.
- Migrations need a role with `CREATEROLE` on the first run, and operations must create the login that holds `ai_sql_reader` in each environment.
- Server logs hold the model's SQL and up to 1000 characters of each result ([AI README, Observability](../../../backend/ai/README.md#observability)).

## References

- Issue #76, PRs #77 and #106.
- [AI README, Read-only shop data](../../../backend/ai/README.md#read-only-shop-data) for the current layers and the login setup.
- [API contracts §6](../../contracts/api-contracts.md#công-cụ-đọc-dữ-liệu-tiệm-của-agent).
