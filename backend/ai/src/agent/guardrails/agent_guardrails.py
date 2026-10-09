"""Deterministic guardrails for the shop agent, applied through one `AgentGuardrails`.

`AgentService.chat` applies them in this order:

1. `check_input` on the owner's message: `redact_input` masks card numbers and redacts
   API keys, bearer tokens and JWTs before the model sees the message or it is stored
   (NFR-008). Tool results are left alone because the owner may ask for the shop's own
   phone number. A message longer than `max_input_chars` raises
   `GuardrailError("input_too_long")` without a model call.
2. Per-turn limits on the run: `usage_limits` caps the model requests at
   `model_call_limit` and the input plus output tokens at `turn_token_limit`, and the
   `ToolCallLimit` capability runs at most `tool_call_limit` tool calls. Calls over the
   tool limit are refused and the tools are hidden, so the model has to answer.
   `AgentService` also stops a run that passes `turn_timeout_seconds`.
3. `check_answer`, the agent's output validator: `screen_answer` sends an empty answer,
   or one that leaks internals (view names, scope settings, error codes, a SELECT
   statement), back to the model to answer again. Each retry is a model request, so
   the request limit bounds the retries.

A run that reaches the request or token limit, or gives up after the retries, raises
`GuardrailError("answer_unavailable")` from `AgentService`, and one that passes the
time limit raises `GuardrailError("answer_timeout")`. The service stores nothing
for a turn a guardrail stops, and the router answers 422 with the code as `detail`;
the app maps the code to its own text, so the service holds no owner-facing copy.

Each guardrail lives in its own module of this package; `AgentGuardrails` holds the
limits and is the only part `AgentService` calls.

A query the SQL guard or the database rejects needs no guardrail: the `query_shop_data`
tool returns it to the model as `Error[CODE]: ...` text, and any other tool exception
propagates, so the router answers 503 ai_unavailable.

There is deliberately no model-based safety check, human-in-the-loop step or LLM query
checker: each adds a model call or a reviewer the owner cannot be, while the SQL guard,
the read-only role and the shop-scoped views already bound what a query can do.
"""

from dataclasses import dataclass

from pydantic_ai import UsageLimits

from src.agent.guardrails.answer_screen import screen_answer
from src.agent.guardrails.input_redaction import redact_input
from src.agent.guardrails.tool_call_limit import ToolCallLimit


@dataclass(frozen=True)
class GuardrailLimits:
    """Per-turn guardrail limits; the composition root supplies them from config."""

    max_input_chars: int
    model_call_limit: int
    tool_call_limit: int
    turn_token_limit: int
    turn_timeout_seconds: float


class GuardrailError(Exception):
    """A guardrail stopped the turn; `code` is the stable code the app maps to text."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class AgentGuardrails:
    """The guardrails one agent applies before, during and after every run."""

    def __init__(self, limits: GuardrailLimits) -> None:
        self.max_input_chars = limits.max_input_chars
        self.usage_limits = UsageLimits(
            request_limit=limits.model_call_limit,
            total_tokens_limit=limits.turn_token_limit,
        )
        self.turn_timeout_seconds = limits.turn_timeout_seconds
        # Pydantic AI ends the run on a tool's second invalid call, or the answer
        # screen's second rejection, by default; the request limit already bounds
        # the run, so it bounds retries too.
        self.retries = limits.model_call_limit
        # Shared by every run: `ToolCallLimit.for_run` gives each run its own count.
        self.capabilities = [ToolCallLimit(limits.tool_call_limit)]

    def check_input(self, message: str) -> str:
        """Return the message to send and store; raise if it is over the limit."""
        if len(message) > self.max_input_chars:
            raise GuardrailError("input_too_long")
        return redact_input(message)

    def check_answer(self, answer: str) -> str:
        """Return the answer the owner may see; raise `ModelRetry` to ask again."""
        return screen_answer(answer)
