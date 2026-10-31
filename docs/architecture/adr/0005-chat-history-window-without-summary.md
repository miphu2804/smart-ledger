# ADR-0005: Send a fixed window of chat history, never a summary

- **Status:** Accepted, recorded after the fact; summary removed in #145 on 2026-10-09, window set in #260 on 2026-10-16
- **Date:** 2026-10-30
- **Owner:** not assigned

## Context

- Each chat turn must give the model enough of the conversation to answer follow-up questions, inside one model context window.
- #74 (2026-10-02) added a rolling summary: 50 messages stayed verbatim, older ones were folded by a summary model in a background task, and a `search_chat_history` tool searched the full history.
- #145 (2026-10-09) removed the summary, the search tool and the summary model while moving the agent from LangChain to Pydantic AI. The PR records the change but not the reason.

## Decision

- Each turn sends the static prompt, then the latest `AGENT_HISTORY_TURNS` owner and assistant exchanges verbatim, then the new message. Older messages do not reach the model.
- Nothing summarizes, folds or searches the history. Earlier answers lose their ```` ```actions ```` block before replay.
- The default window is 30 exchanges (was 100 until #260). 30 exchanges at the 2000-character input cap keep one request well inside a 100k-token window.
- Facts that must outlive the window belong to long-term memory ([ADR-0002](0002-agent-long-term-memory.md)), which stores extracted facts, never the history.

## Options considered

| Option | Outcome |
|---|---|
| Rolling summary plus history search (#74) | Built, then removed in #145 |
| Fixed verbatim window | Chosen |

## Consequences

- A turn makes no extra model call for history, and no background task writes to the conversation after a reply.
- The static instructions and the history form a cacheable prefix; the shop time follows the new message so it does not break the cache.
- The agent forgets anything said more than 30 exchanges earlier in the same conversation, unless long-term memory holds it. Owners chat little, so this is expected to be rare; raise `AGENT_HISTORY_TURNS` if it is not.
- `chat_conversations.summary` and `summary_through_message_id` are no longer read or written. They are kept so the previous release can roll back, and a later migration should drop them.
- `SUMMARY_MODEL_NAME` is still listed in `backend/ai/.env.example` although no code reads it.

## Open questions

- Why was the rolling summary removed in #145? The owner of that change should add the reason here.

## References

- PRs #74, #145 and #260.
- [AI README, Chat history and context](../../../backend/ai/README.md#chat-history-and-context).
