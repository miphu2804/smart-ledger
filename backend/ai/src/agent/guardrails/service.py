"""Guardrails of the shop agent, applied through one `GuardrailService`.

`AgentService` calls only this facade, in this order:

1. `check_input` on the owner's message, before the run starts: a message longer than
   `max_input_chars` raises `GuardrailError("input_too_long")` without a model call,
   then `InputRedaction` replaces keys, tokens, card numbers, IBANs and emails with
   `[redacted:<name>]` (NFR-008). The redacted text is what the model sees and what is
   stored. Tool results are left alone because the owner may ask for the shop's own
   phone number. The length check runs here rather than as a Pydantic AI Harness
   `InputGuardrail`, so the stream route can still answer `422 input_too_long` before
   the stream opens.
2. Per-turn limits on the run: `usage_limits` caps the model requests at
   `model_call_limit` and the input plus output tokens at `turn_token_limit`, the
   `ToolCallLimit` capability runs at most `tool_call_limit` tool calls, and
   `run_limits` stops a run that passes `turn_timeout_seconds`. Calls over the tool
   limit are refused and the tools are hidden, so the model has to answer.
3. The Harness `OutputGuardrail` in `capabilities`: `AnswerScreen.check` sends an empty
   answer, or one that leaks internals (view names, scope settings, error codes, a
   SELECT statement), back to the model to answer again. Each retry is a model
   request, so the request limit bounds the retries. A streamed answer releases only
   the prefix `screened_prefix` proves safe, because the Harness screens only the
   final output.

`run_limits` turns a run that reaches the request or token limit, or gives up after
the retries, into `GuardrailError("answer_unavailable")`, and one that passes the time
limit into `GuardrailError("answer_timeout")`. The service stores nothing for a turn a
guardrail stops, and the router answers 422 with the code as `detail`; the app maps
the code to its own text, so the service holds no owner-facing copy.

A query the SQL guard or the database rejects needs no guardrail: the `query_shop_data`
tool returns it to the model as `Error[CODE]: ...` text, and any other tool exception
propagates, so the router answers 503 ai_unavailable.

There is deliberately no model-based safety check, human-in-the-loop step or LLM query
checker: each adds a model call or a reviewer the owner cannot be, while the SQL guard,
the read-only role and the shop-scoped views already bound what a query can do.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from pydantic_ai import UnexpectedModelBehavior, UsageLimitExceeded, UsageLimits
from pydantic_ai_harness import OutputGuardrail

from src.agent.errors import GuardrailError
from src.agent.guardrails.answer_screen import AnswerScreen
from src.agent.guardrails.input_redaction import InputRedaction
from src.agent.guardrails.tool_call_limit import ToolCallLimit

logger = logging.getLogger(__name__)


@dataclass(frozen=True, kw_only=True)
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
        self.max_input_chars = limits.max_input_chars
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
            OutputGuardrail(guard=AnswerScreen.check),
            ToolCallLimit(limits.tool_call_limit),
        ]

    def check_input(self, message: str) -> str:
        """Return the message to send and store; raise if it is over the limit."""
        if len(message) > self.max_input_chars:
            raise GuardrailError("input_too_long")
        return InputRedaction.redact(message)

    @asynccontextmanager
    async def run_limits(self) -> AsyncIterator[None]:
        """Stop a run at the turn timeout or a model limit, as a guardrail code."""
        try:
            async with asyncio.timeout(self.turn_timeout_seconds):
                yield
        except TimeoutError as error:
            # Stopped before Core stops waiting, so the turn is not stored behind an
            # error the owner already saw.
            logger.warning("agent run passed the turn timeout")
            raise GuardrailError("answer_timeout") from error
        except (UsageLimitExceeded, UnexpectedModelBehavior) as error:
            # The model used up its requests or never gave an answer the screen
            # accepts. Provider errors are neither, so they still propagate and the
            # router answers 503.
            logger.warning("agent run ended without an answer: %s", error)
            raise GuardrailError("answer_unavailable") from error

    def screened_prefix(self, partial: str) -> str:
        """Return the part of a streamed answer that may be sent so far."""
        return AnswerScreen.screened_prefix(partial)

    def allows_answer(self, text: str) -> bool:
        """Whether the screen passes `text` as answer text the owner may keep.

        The Harness screens only the final output, so text a response wrote before a
        screen-button call is checked here before it becomes the answer.
        """
        return AnswerScreen.check(text).action == "allow"
