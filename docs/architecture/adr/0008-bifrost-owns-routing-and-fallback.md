---
type: Architecture Decision
title: "ADR-0008: Bifrost owns upstream routing and fallback, the AI service only picks an alias"
description: "Accepted: the AI service picks a model alias; Bifrost owns upstream routing, fallback and content-free request logs."
owner: not assigned
status: stable
author: miphu2804
---
# ADR-0008: Bifrost owns upstream routing and fallback, the AI service only picks an alias

- **Status:** Accepted — the project owner settled this direction on 2026-10-30
- **Date:** 2026-10-30
- **Owner:** not assigned

## Context

Environment statements, alias values and owner tasks below record the dated decisions/observations, not a live deployment audit. Current code defaults, tier examples and settings belong to the [AI model guide](../../../backend/ai/docs/architecture.md#model-provider-and-routing); deployed flags and Dopbase values remain unverified here. The accepted decision and dated update history are unchanged.

- The AI service needs to call the same model through several upstreams (previously OpenCode Go and OpenAI) and switch upstream on transient errors such as 429, without changing code in `agent`, `memory` and `drafts`.
- Previously `build_chat_model` chose the API by `MODEL_PROVIDER`, and the fallback lived in `MODEL_FALLBACKS` in Python, so every upstream change required changing the AI configuration and redeploying.
- A self-hosted Bifrost already runs on staging. It logs every request, including provider, model, latency, tokens, cost, fallback chain and matched rule, so it is the natural place to see requests going upstream.
- Message content only reaches HoneyHive at the Agent layer (`NFR-008`), so Bifrost's logs do not need to keep content.
- Production has no Bifrost yet; it runs an old image from before aliases (#436) and calls OpenCode Go directly; the changes in the Update sections do not apply to production.

## Decision

- The application requests a model with `LLMFactory.create_model(alias)`. `MODEL_ALIASES` maps an alias to a `protocol` and a `model`, so the application does not know who the upstream is.
- Each protocol has its own provider class (`OpenAIChatProvider`, `OpenAIResponsesProvider`) with the same `create_model(model_name)` method, and no base class because the project has only one caller.
- Upstream routing and fallback live in the routing rules of [`deploy/vps/bifrost.json`](../../../deploy/vps/bifrost.json). There are no rules yet, because each model has only one upstream; add a fallback to another model only when the project owner accepts the change in behavior.
- Bifrost keeps logs for 14 days with `disable_content_logging: true`. The application sends `x-bf-session-id` to group logs by conversation and `x-bf-lh-shop-id` to attach the shop to the metadata.
- `MODEL_FALLBACKS` in Python is kept, in the `protocol:model` form, until production runs Bifrost; then remove it in a separate change.

## Consequences

- Changing upstream or fallback only requires editing `bifrost.json` and deploying Bifrost, not redeploying the AI service.
- The Bifrost UI shows only metadata, not prompts and answers; to read content, look at HoneyHive.
- For now there are two places that define fallback, depending on whether the environment has Bifrost.
- Bifrost is a new point of failure on the model-call path on staging; uptime monitoring is tracked in [issue #435](https://github.com/miphu2804/smart-ledger/issues/435).

## Update 2026-11-01: native OpenAI, Inception, drop Anthropic and OpenCode Go

- **Why:** on staging every chat turn got `401 virtual key is required` from Bifrost. The `chat` alias used `anthropic_messages`, the Anthropic SDK sends the key in `x-api-key`, and Bifrost accepts `x-api-key` and `Authorization: Bearer` only for keys with the `sk-bf-` prefix; the old virtual key only passes through `x-bf-vk`. The project owner also dropped OpenCode Go.
- **Model:** the `chat` alias runs `gpt-6-luna` on Bifrost's native `openai` provider through `openai_responses`, with effort `high`. `effort` lives in each alias of `MODEL_ALIASES`; `MODEL_REASONING_EFFORT` is only the default when an alias does not declare it.
- **Header:** `OpenAIChatProvider` and `OpenAIResponsesProvider` build `AsyncOpenAI` with `default_headers={"x-bf-vk": api_key}`. The header lives on the client because the per-run `extra_headers` replace the model's whole header set.
- **Removed:** the `anthropic_messages` path (`AnthropicMessagesProvider`, `ANTHROPIC_BASE_URL`, the pydantic-ai `anthropic` extra), the two OpenCode Go providers and two routing rules, and the `x-opencode-session` and `x-bf-eh-*` headers. `openai_chat` is kept because Mercury only has `/chat/completions`.
- **Inception:** `bifrost.json` has a custom `inception` provider (`base_provider_type: openai`, `https://api.inceptionlabs.ai`) for `mercury-3`, with the key taken from the `INCEPTIONLABS_API_KEY` environment variable. `vk-ai` allows exactly `gpt-6-luna` and `mercury-3`. Mercury 3 has not been tested in practice, so no alias or fallback points to it yet; to use it, add an `openai_chat` alias after running the [chat evaluation suite](../../../backend/ai/evaluation/agent_chat/README.md) with effort `medium` and `high` against `gpt-6-luna`.
- **Retries:** both providers set `max_retries: 1` and `retry_backoff_initial: 500` ms.
- **Project owner tasks:** set `MODEL_ALIASES` in Dopbase `ai/staging`, add `INCEPTIONLABS_API_KEY` to Bifrost's secrets, delete `OPENCODE_GO_API_KEY`, and rerun the playbook so Bifrost loads the new `bifrost.json`.

## Update 2026-11-04: the AI service picks the alias by the complexity of each chat turn

- **Why:** easy questions need a fast answer on `mercury-3`, hard questions need `gpt-6-luna`. Bifrost's Complexity Router can classify tiers, but a routing rule's target only overrides provider, model, `key_id` and fallbacks, and cannot change the reasoning effort. Inception only has `/chat/completions` while `gpt-6-luna` runs through `openai_responses`, and the Bifrost documentation does not promise converting Responses to Chat for a custom provider. So the AI service picks the alias for each turn, while Bifrost still owns upstream and fallback as in the original decision.
- **Decision:** when `MODEL_TIERING_ENABLED=true`, `LLMRouterService` (`backend/ai/src/llm_router/`) sends the shop owner's latest message, plus one earlier message of theirs, to `typesafe/jev-latest` through Bifrost's `/v1/decisions`. The assistant's answers are never sent. SIMPLE runs `chat-simple`, MEDIUM runs `chat-medium`, COMPLEX runs `chat-complex`; each alias's model and effort live in `MODEL_ALIASES` (see the [AI README](../../../backend/ai/docs/runtime-reference.md#model-tiers)).
- **Per conversation:** like Bifrost's session-aware routing, a conversation keeps the highest tier it has reached and only moves up; once COMPLEX, Jev is no longer called. The tier lives in process memory for 24 hours; a restart only makes the next turn classify again, so no migration is needed.
- **On failure:** if Jev errors, exceeds `TIER_CLASSIFIER_TIMEOUT_SECONDS` (default 1.5 seconds) or refuses to answer, that turn runs `chat-complex`, and this tier is not kept for the conversation. Each turn picks the model once, and every tool-call step within the turn uses the same model. Classification runs in parallel with memory recall.
- **Bifrost:** `bifrost.json` adds the `typesafe` provider (key `TYPESAFE_API_KEY`, `max_retries: 0` so retries do not exceed the timeout), lets `vk-ai` use `jev-latest`, and limits `inception` to `chat_completion` and `chat_completion_stream`.
- **Switch:** off by default, every turn runs `chat` as before. Turn it on in staging only after running the [chat evaluation suite](../../../backend/ai/evaluation/agent_chat/README.md) twice on the same `suite_version`, `chat` only and with tiers, and trying `gpt-6-luna` directly with effort `xhigh`; turning it on in production needs the project owner's approval.
- **Project owner tasks:** add `TYPESAFE_API_KEY` to Bifrost's secrets and rerun the playbook; set `MODEL_ALIASES` with the three tier aliases, `TIER_CLASSIFIER_URL` and `MODEL_TIERING_ENABLED` in Dopbase `ai/staging`.
