"""Deterministic guardrails for the shop agent.

`AgentService.chat` applies them in this order:

1. `redact_input` on the owner's message: card numbers are masked and API keys, bearer
   tokens and JWTs are redacted before the model sees the message or it is stored
   (NFR-008). Tool results are left alone because the owner may ask for the shop's own
   phone number.
2. A message longer than `max_input_chars` gets `INPUT_TOO_LONG_REPLY` without a model
   call.
3. Per-turn limits: Pydantic AI's `UsageLimits` caps the model requests at
   `model_call_limit`, and `ToolCallLimit` runs at most `tool_call_limit` tool calls.
   Calls over the tool limit are refused and the tools are hidden, so the model has to
   answer; reaching the model limit ends the run with `EMPTY_ANSWER_REPLY`.
4. `screen_answer` on the final answer: an empty answer, or one that leaks internals
   (view names, scope settings, error codes, a SELECT statement), is replaced with a
   safe Vietnamese reply.

A query the SQL guard or the database rejects needs no guardrail: the `query_shop_data`
tool returns it to the model as `Error[CODE]: ...` text, and any other tool exception
propagates, so the router answers 503 ai_unavailable.

There is deliberately no model-based safety check, human-in-the-loop step or LLM query
checker: each adds a model call or a reviewer the owner cannot be, while the SQL guard,
the read-only role and the shop-scoped views already bound what a query can do.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic_ai import RunContext, ToolFailed
from pydantic_ai.capabilities import AbstractCapability, ValidatedToolArgs
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from src.sql.guard import SqlGuard

# The owner reads these fixed replies in the app, so they stay Vietnamese; the copy
# lives in a locale file to keep the source English.
_REPLIES = json.loads(
    (Path(__file__).parent / "replies.vi.json").read_text(encoding="utf-8")
)
INPUT_TOO_LONG_REPLY = _REPLIES["input_too_long"]
EMPTY_ANSWER_REPLY = _REPLIES["empty_answer"]
LEAK_REPLY = _REPLIES["leak"]

# Sixteen digits in groups of four; only numbers that pass the Luhn check are masked.
CARD_PATTERN = re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b")

# Secrets an owner might paste by mistake: OpenAI-style keys, bearer tokens and JWTs.
SECRET_PATTERN = re.compile(
    r"sk-[A-Za-z0-9_-]{20,}"
    r"|Bearer\s+[A-Za-z0-9._~+/=-]{20,}"
    r"|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"
)
SECRET_REPLACEMENT = "[REDACTED_API_KEY]"

# Internals the answer must never show: the view schema and names, the scope setting
# and its functions, raw tool error codes or a SQL query. The view names come from
# SqlGuard, so a view added there is covered here without a second edit.
_VIEW_NAMES = "|".join(re.escape(view) for view in sorted(SqlGuard.ALLOWED_VIEWS))
LEAK_PATTERN = re.compile(
    rf"{re.escape(SqlGuard.VIEW_SCHEMA)}\.|smartledger\.shop_id|set_config|"
    rf"current_setting|Error\[|\b(?:{_VIEW_NAMES})\b|"
    r"\bselect\b[\s\S]{1,400}?\bfrom\b",
    re.IGNORECASE,
)

# What the model reads for a refused tool call.
TOOL_LIMIT_NOTICE = (
    "Tool call limit reached for this turn. Answer with the data you already have."
)


@dataclass(frozen=True)
class GuardrailLimits:
    """Per-turn guardrail limits; the composition root supplies them from config."""

    max_input_chars: int
    model_call_limit: int
    tool_call_limit: int


@dataclass
class ToolCallLimit(AbstractCapability[Any]):
    """Run at most `limit` tool calls per turn, then leave the model only an answer.

    Pydantic AI's own `tool_calls_limit` ends the run when a parallel batch would cross
    the limit; this runs the batch's first calls and refuses the rest, so the model can
    still answer from the data it got. Calls are counted as they start, so the count
    holds while one batch runs concurrently.
    """

    limit: int
    started: int = 0

    async def for_run(self, ctx: RunContext[Any]) -> "ToolCallLimit":
        # Chat turns run concurrently, so each run counts its own calls.
        return ToolCallLimit(self.limit)

    async def prepare_tools(
        self, ctx: RunContext[Any], tool_defs: list[ToolDefinition]
    ) -> list[ToolDefinition]:
        return tool_defs if self.started < self.limit else []

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: ValidatedToolArgs,
    ) -> ValidatedToolArgs:
        if self.started >= self.limit:
            raise ToolFailed(TOOL_LIMIT_NOTICE)
        self.started += 1
        return args


def redact_input(text: str) -> str:
    """Return the owner's message with card numbers masked and secrets redacted."""
    masked = CARD_PATTERN.sub(_mask_card, text)
    return SECRET_PATTERN.sub(SECRET_REPLACEMENT, masked)


def screen_answer(answer: str) -> str:
    """Return the answer the owner may see: a fallback for an empty or leaking one."""
    if not answer.strip():
        return EMPTY_ANSWER_REPLY
    if LEAK_PATTERN.search(answer):
        return LEAK_REPLY
    return answer


def _mask_card(match: re.Match[str]) -> str:
    """Keep the last four digits of a card number, in the owner's grouping."""
    number = match.group()
    digits = [int(character) for character in number if character.isdigit()]
    if not _passes_luhn(digits):
        return number
    last_four = "".join(str(digit) for digit in digits[-4:])
    separator = "-" if "-" in number else " " if " " in number else ""
    return separator.join(["****", "****", "****", last_four])


def _passes_luhn(digits: list[int]) -> bool:
    checksum = 0
    for index, digit in enumerate(reversed(digits)):
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        checksum += digit
    return checksum % 10 == 0
