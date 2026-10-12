"""Guardrails of the shop agent, applied through one `GuardrailService`.

Each guardrail is one class in its own module, named after the Pydantic AI Harness use
case it covers. `AgentService` calls only this facade, in this order:

1. `check_input` on the owner's message, before the run starts: `InputLengthLimit`
   raises `GuardrailError("input_too_long")` without a model call, then
   `SecretRedaction` and `PersonalDataRedaction` replace keys, tokens, card numbers
   and emails with `[redacted:<name>]` (NFR-008). The redacted text is what the model
   sees and what is stored. Tool results are left alone because the owner may ask for
   the shop's own phone number.
2. Per-turn limits on the run: `usage_limits` caps the model requests at
   `model_call_limit` and the input plus output tokens at `turn_token_limit`, and the
   `ToolCallLimit` capability runs at most `tool_call_limit` tool calls. Calls over the
   tool limit are refused and the tools are hidden, so the model has to answer.
   `AgentService` also stops a run that passes `turn_timeout_seconds`.
3. The Harness `OutputGuardrail` in `capabilities`: `EmptyAnswerCheck` and
   `AnswerLeakScreen` send an empty answer, or one that leaks internals (view names,
   scope settings, error codes, a SELECT statement), back to the model to answer
   again. Each retry is a model request, so the request limit bounds the retries. A
   streamed answer releases only the prefix `screened_prefix` proves safe, because the
   Harness screens only the final output.

A run that reaches the request or token limit, or gives up after the retries, raises
`GuardrailError("answer_unavailable")` from `AgentService`, and one that passes the
time limit raises `GuardrailError("answer_timeout")`. The service stores nothing
for a turn a guardrail stops, and the router answers 422 with the code as `detail`;
the app maps the code to its own text, so the service holds no owner-facing copy.

A query the SQL guard or the database rejects needs no guardrail: the `query_shop_data`
tool returns it to the model as `Error[CODE]: ...` text, and any other tool exception
propagates, so the router answers 503 ai_unavailable.

There is deliberately no model-based safety check, human-in-the-loop step or LLM query
checker: each adds a model call or a reviewer the owner cannot be, while the SQL guard,
the read-only role and the shop-scoped views already bound what a query can do.
"""

from dataclasses import dataclass

from pydantic_ai import UsageLimits
from pydantic_ai_harness import OutputGuardrail

from src.agent.guardrails.answer_leak_screen import AnswerLeakScreen
from src.agent.guardrails.empty_answer_check import EmptyAnswerCheck
from src.agent.guardrails.input_length_limit import InputLengthLimit
from src.agent.guardrails.personal_data_redaction import PersonalDataRedaction
from src.agent.guardrails.secret_redaction import SecretRedaction
from src.agent.guardrails.tool_call_limit import ToolCallLimit


@dataclass(frozen=True)
class GuardrailLimits:
    """Per-turn guardrail limits; the composition root supplies them from config."""

    max_input_chars: int
    model_call_limit: int
    tool_call_limit: int
    turn_token_limit: int
    turn_timeout_seconds: float


class GuardrailService:
    """The guardrails one agent applies before, during and after every run."""

    def __init__(self, limits: GuardrailLimits) -> None:
        self.input_length_limit = InputLengthLimit(limits.max_input_chars)
        self.usage_limits = UsageLimits(
            request_limit=limits.model_call_limit,
            total_tokens_limit=limits.turn_token_limit,
        )
        self.turn_timeout_seconds = limits.turn_timeout_seconds
        # Pydantic AI ends the run on a tool's second invalid call, or the output
        # guard's second retry, by default; the request limit already bounds the run,
        # so it bounds retries too.
        self.retries = limits.model_call_limit
        # Shared by every run: `ToolCallLimit.for_run` gives each run its own count.
        self.capabilities = [
            OutputGuardrail(guard=[EmptyAnswerCheck.check, AnswerLeakScreen.check]),
            ToolCallLimit(limits.tool_call_limit),
        ]

    def check_input(self, message: str) -> str:
        """Return the message to send and store; raise if it is over the limit."""
        message = self.input_length_limit.check(message)
        # Secrets first: a card or email pattern matching inside a key would break the
        # key apart before the secret pattern could remove all of it.
        return PersonalDataRedaction.redact(SecretRedaction.redact(message))

    def screened_prefix(self, partial: str) -> str:
        """Return the part of a streamed answer that may be sent so far."""
        return AnswerLeakScreen.screened_prefix(partial)
