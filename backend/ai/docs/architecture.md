---
type: Guide
title: "SmartLedger AI service architecture"
description: "AI responsibilities, request lifecycle, trust boundaries, persistence and external data exposure."
owner: AI owner
author: miphu2804
status: stable
stale_after: 2027-01-05T22:18:48+07:00
---
# SmartLedger AI service architecture

The AI service answers internal Agent chat requests from Core. It can read scoped shop data and produce answers, but it cannot write the business ledger. This overview describes checked-in source at `staging` revision `a2766ee3a37e23c0f03fd43383b608c1b2fac898`, not live deployment, enablement or product acceptance.

Use the [runtime reference](runtime-reference.md) for configuration, implementation limits and operational procedures, and the [API contract](../../../docs/contracts/api-contracts.md#6-core--ai-internal) for endpoint and event schemas.

## Service composition

Core authenticates the OWNER and checks shop access before calling AI. AI coordinates conversation history, model routing, deterministic guardrails, read-only tools and optional memory. PostgreSQL is the history source of truth; Redis is an optional cache. Bifrost owns gateway routing and fallback when configured.

The shared internal token authenticates the calling service, not the user/shop pair. AI accepts tenant IDs supplied by that caller and does not independently verify that the user owns the shop. Protecting the token and restricting AI network access are therefore part of the authorization boundary; a token holder can submit another tenant's IDs. This audit did not verify live network restrictions.

## Chat history and context

Conversation reads and writes are scoped by user and shop. The model receives a bounded recent-message window without summarization. Cache failure falls back to PostgreSQL; it does not create a second history authority. [History implementation](runtime-reference.md#chat-history-and-context).

## Model provider and routing

The application supports OpenAI Responses and Chat Completions protocols, directly or through a compatible gateway. Optional tiering selects one model for the turn; classification failure uses the configured complex-tier model. Model identities, provider credentials and routing defaults belong in the [runtime reference](runtime-reference.md#model-provider-and-routing), not this overview.

## Read-only shop data

The model supplies a query, not a tenant ID. A SQL guard restricts queries to allowlisted read views; a separate database role, transaction-scoped shop filter and read-only transaction enforce additional boundaries. The views use `security_barrier` and expose neither base-table writes nor unrestricted ledger access.

Customer contact and transfer-reference fields are excluded, but the shop-profile view includes the shop's phone and address. This is data minimization, not complete contact anonymization. [Query boundaries](runtime-reference.md#read-only-shop-data).

## Restock suggestions

The restock tool reads sales and stock and returns suggested quantities; it changes no stock or orders. Its cover policy is an implementation default, not approved product acceptance. [Policy and supported periods](runtime-reference.md#restock-suggestions).

## Guardrails and answer safety

Deterministic controls bound input, model calls, tokens, tool use and elapsed time. Input redaction and answer screening reduce secret leakage and internal-detail exposure; neither is a general anonymization guarantee. [Controls and failure codes](runtime-reference.md#guardrails-and-answer-safety).

## Calculation and sandbox

The calculation tool performs bounded in-process arithmetic. The optional Monty sandbox runs model-written code with separate resource limits and currently exposes no nested data tools. Repository wiring is not an independent security audit of dependency permissions; the container remains the process boundary. [Limits and wiring](runtime-reference.md#calculation-and-sandbox).

## Long-term memory and ONNX embeddings

Long-term memory is approved by the product owner ([ADR-0002](../../../docs/architecture/adr/0002-agent-long-term-memory.md), `FR-040`) and enabled in production; the code default of `AGENT_MEMORY_ENABLED` is still `false`, so each environment sets it. Memories are scoped by user and shop; default embeddings run locally. Selecting a remote embedding provider adds an external data flow.

Turning the owner's switch off suppresses recall and extraction, but an already-recalled turn can still update usage metadata. It does not delete retained memories or guarantee zero writes. [Providers, lifecycle and authorized re-embedding](runtime-reference.md#long-term-memory-and-onnx-embeddings).

## Draft parser boundary

An internal text-parser helper exists, but no HTTP draft-parsing endpoint exposes it. It is separate from Mobile's rule-based order parser and is not an implemented AI-to-sale workflow. [Helper behavior](runtime-reference.md#draft-parser-boundary).

## Streaming and persistence

The service streams answer text and tool progress; a reset invalidates earlier provisional text. The final completion event identifies the stored answer. Disconnect cancels the producer, but a database write already running on a worker thread may still commit; absence of a completion event is not proof of non-persistence. [Stream contract](../../../docs/contracts/api-contracts.md#chat-answer-stream) and [implementation](runtime-reference.md#streaming-and-persistence).

## Observability

Logs, request metrics and optional HoneyHive traces serve different purposes. Normal-level tool logs omit payloads; debug logging can include SQL, results and diagnostic details and needs restricted access.

When tracing is enabled, prompts, redacted owner questions, tool arguments/results and answers leave the service for HoneyHive. Customer names and phone numbers can remain, as can shop contacts returned by tools. Secret-pattern redaction does not remove all personal data. Enabling tracing therefore requires the applicable access, retention and privacy controls; live configuration and approval were not verified here.

See [trace activation, fields and delivery behavior](runtime-reference.md#observability) for implementation details and [HoneyHive configuration](../../../.honeyhive/README.md) for evaluators and dashboards.

## Database and migrations

AI uses separate application and read-only database connections and does not create tables at startup. Core migrations precede AI migrations; shared-environment changes require the repository's authorization and migration process. [Connection setup and migration procedure](runtime-reference.md#database-and-migrations).

## Configuration

The [runtime reference](runtime-reference.md#configuration) owns configuration defaults. Actual credentials belong in the [secrets workflow](../../../docs/development/secrets-and-env.md), never in documentation examples or source control.

## Run and check

Use the [service README](../README.md) for setup and tests, the [runtime checks](runtime-reference.md#run-and-check) for detailed commands and the [evaluation guide](../evaluation/README.md) for offline or explicitly authorized live evaluations.
