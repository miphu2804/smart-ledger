# ADR-0006: Agent guardrails are deterministic code, not model checks

- **Status:** Accepted, recorded after the fact; decided in #77 on 2026-10-02, moved to Pydantic AI Harness in #195 on 2026-10-14
- **Date:** 2026-10-30
- **Owner:** not assigned

## Context

- A chat turn must stay bounded in cost and time, must not leak internals such as SQL or view names, and must not send tokens or other secrets the owner pasted to the model or the trace (`NFR-008`).
- Core times out its AI call after 40 s, and a turn Core gave up on must not be stored.
- Each model-based check adds a model call to every turn, on a small model that answers in tens of seconds when it uses tools.

## Decision

Every guardrail is deterministic code behind one `GuardrailService` facade, built on the [Pydantic AI Harness guardrails](https://pydantic.dev/docs/ai/harness/guardrails/):

| Check | Kind |
|---|---|
| Message length | Count before any model call |
| Redaction of keys, tokens, JWTs, IBANs, Luhn-valid cards and emails | Pattern detectors, before the model sees the message and before storage |
| Model requests, tokens and time per turn | Usage limits and a turn timeout below Core's |
| Tool calls per turn | Counter; further calls are refused |
| Answer screen | Patterns for empty answers and leaked views, settings, error codes or SQL; a hit sends the answer back for a retry |

A stopped turn answers `422` with a code and stores nothing. The service holds no owner-facing text; the app maps each code to its copy.

## Options considered

| Option | Outcome |
|---|---|
| Model-based safety, answer or query check | Rejected in #77: one more model call per turn, while the role, views and guard already bound what a query can do |
| Human approval step | Rejected: the owner cannot judge SQL or tool calls |
| LangChain middleware (#77) | Replaced by Pydantic AI in #145 and by Harness guardrails in #195, with the same checks |

## Consequences

- Every check is testable with a fake model and gives the same result on every run.
- Limits are provisional until the PO approves them; each answered turn logs its token usage to size them.
- Keeping the agent to shop topics is a prompt rule, not a guardrail, so an off-topic answer can still get through and the decline wording varies.
- The Harness US SSN pattern is off because its 3-2-4 digit shape matches order codes.
- A Harness `block` verdict or an input guardrail added later must also be caught by `run_limits`, or the caller gets `503` instead of `422`.

## References

- PRs #77, #145 and #195.
- [AI README, Guardrails](../../../backend/ai/README.md#guardrails) for the current limits and codes.
- [ADR-0004](0004-agent-read-only-text-to-sql.md) for the database-side bounds on the agent's queries.
