# SmartLedger AI

SmartLedger AI is the internal FastAPI service for the owner's Agent chat. Core is the only caller: it proxies the public `/api/v1/agent/*` routes to AI. Frontends must not call this service directly.

| Need | Read |
|---|---|
| Request and response shapes | [API contracts §5–6](../../docs/contracts/api-contracts.md#5-ai-through-core) |
| Implementation status | [Technical design §1](../../docs/architecture/technical-design.md#1-scope) |
| Responsibilities and trust boundaries | [AI service architecture](docs/architecture.md) |
| Configuration and operational details | [AI runtime reference](docs/runtime-reference.md) |
| Code walkthrough | [Service walkthrough §8](../../docs/architecture/service-walkthrough/README.md#8-ai-service) |
| Vector and memory decisions | [ADR-0001](../../docs/architecture/adr/0001-vector-store-pgvector.md), [ADR-0002](../../docs/architecture/adr/0002-agent-long-term-memory.md) |

## Routes

`src/main.py` is the composition root. Every `/internal/v1` route inherits the `X-Internal-Token` check. `/health` and `/metrics` are unauthenticated; hosted delivery must restrict them to the internal network. The local Compose stack publishes the AI port, so local reachability is not an access-control guarantee. `/health` checks no dependency.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/internal/v1/agent/chat` | One chat turn, JSON answer |
| `POST` | `/internal/v1/agent/chat/stream` | The same turn as server-sent events; Core relays it |
| `GET` | `/internal/v1/agent/conversations` | List the owner's conversations |
| `GET` `PATCH` `DELETE` | `/internal/v1/agent/conversations/{id}` | Read, rename or delete a conversation |
| `GET` `PUT` | `/internal/v1/agent/memory/settings` | Read or set the owner's memory switch |
| `GET` | `/internal/v1/agent/memory/items` | List live memories |
| `DELETE` | `/internal/v1/agent/memory/items/{id}` | Forget one memory |

There are no invoice, expense or draft endpoints. Error mapping and the Core proxy boundary belong to the [API contract](../../docs/contracts/api-contracts.md#6-core--ai-internal).

## Agent tools

The agent uses Pydantic AI. Prompts are static English instructions that tell the model to answer in Vietnamese.

| Tool | Availability | Boundary |
|---|---|---|
| `query_shop_data` | `AI_SQL_READER_URL` configured | One guarded `SELECT` over tenant-filtered read views |
| `suggest_restock` | `AI_SQL_READER_URL` configured | Read-only stock suggestion |
| `calculate` | `CALC_ENABLED=true` | Closed arithmetic operation set, no I/O |
| `run_code` | `SANDBOX_ENABLED=true` and the Code Mode extra installed | Model-written Python in Monty; no tools are folded in by default |
| `suggest_screen` | Always | Closed set of mobile screen buttons |

AI returns answers and proposals only; it does not create sales, payments, debts or expenses.

## Chat turn

1. Reject an oversized owner message.
2. Redact supported secret and personal-data patterns; names and phone numbers can remain.
3. Load the bounded recent history and, when enabled, recall long-term memory.
4. Select a model and run within request, token, time and tool limits.
5. Screen the answer, append approved screen actions, and save only an accepted turn.
6. Extract memory facts in the background when long-term memory is enabled.

Streaming checks input and history before the first byte and emits answer/progress events. Disconnect cancels the producer, but a database write already running may still commit. Event schemas and persistence semantics belong to the [stream contract](../../docs/contracts/api-contracts.md#chat-answer-stream).

## Run

Settings are owned by the [AI runtime reference](docs/runtime-reference.md#configuration); do not copy volatile model, flag or limit values into other architecture pages.

```bash
uv sync --group dev
cp -n .env.example .env   # keeps an existing .env
uv run python -m src.main
```

For local Compose, checks, migrations and evaluation commands, see [the runtime reference](docs/runtime-reference.md#run-and-check) and [Evaluation](evaluation/README.md).
