"""Deterministic guardrails for the shop agent, built from LangChain middleware.

`AgentGuardrails` groups the middleware by the risk it covers: cost, PII and prompt
injection. A query the SQL guard or the database rejects needs no middleware: the
`query_shop_data` tool returns it to the model as `Error[CODE]: ...` text.

There is deliberately no model-based safety check or human review step: each adds a
model call or a reviewer the owner cannot be, while the SQL guard, the read-only role
and the shop-scoped views already bound what a query can do.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from langchain.agents.middleware import (
    AgentMiddleware,
    AgentState,
    ModelCallLimitMiddleware,
    PIIMiddleware,
    ToolCallLimitMiddleware,
    after_agent,
    before_agent,
)
from langchain_core.messages import AIMessage

from src.agent.sql_guard import SqlGuard
from src.agent.utils import get_latest_human_message


@dataclass(frozen=True)
class GuardrailLimits:
    """Per-turn guardrail limits; the composition root supplies them from config."""

    max_input_chars: int
    model_call_limit: int
    tool_call_limit: int


# The owner reads these fixed replies in the app, so they stay Vietnamese; the copy
# lives in a locale file to keep the source English.
_REPLIES = json.loads(
    (Path(__file__).parent / "replies.vi.json").read_text(encoding="utf-8")
)
INPUT_TOO_LONG_REPLY = _REPLIES["input_too_long"]
EMPTY_ANSWER_REPLY = _REPLIES["empty_answer"]
LEAK_REPLY = _REPLIES["leak"]

# Secrets an owner might paste by mistake: OpenAI-style keys, bearer tokens and JWTs.
SECRET_PATTERN = (
    r"sk-[A-Za-z0-9_-]{20,}"
    r"|Bearer\s+[A-Za-z0-9._~+/=-]{20,}"
    r"|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"
)

# AgentMiddleware is invariant in state and context, so the library's own middleware
# (which declares its own state types) only fits a list of the fully open form.
Guardrail = AgentMiddleware[Any, Any, Any]

# ModelCallLimitMiddleware's English notice when it ends the run.
MODEL_LIMIT_NOTICE = "Model call limits exceeded"

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


class AgentGuardrails:
    """The agent's guardrail middleware, grouped by the risk each group covers."""

    def __init__(self, limits: GuardrailLimits) -> None:
        self.limits = limits

    def get_all_guardrails(self) -> list[Guardrail]:
        """Return every guardrail in the order `create_agent` should run it.

        `before_*` hooks run in list order and `after_*` hooks in reverse, so the leak
        check sees the answer before the empty-answer check.
        """
        return [*self.check_cost(), *self.check_pii(), *self.check_prompt_injection()]

    def check_cost(self) -> list[Guardrail]:
        """Bound the work one turn can cause.

        An owner message over `max_input_chars` ends the turn before any model call.
        Tool calls over the limit are refused; reaching the model-call limit ends the
        run. An empty answer, or the English limit notice that run ends with, is
        replaced with a Vietnamese reply.
        """
        max_chars = self.limits.max_input_chars

        @before_agent(can_jump_to=["end"], name="InputLengthGuard")
        def reject_long_input(state: AgentState, runtime: Any) -> dict[str, Any] | None:
            latest = get_latest_human_message(state["messages"])
            if latest is None or len(latest.text) <= max_chars:
                return None
            reply = INPUT_TOO_LONG_REPLY.format(limit=max_chars)
            return {"messages": [AIMessage(content=reply)], "jump_to": "end"}

        @after_agent(name="EmptyAnswerGuard")
        def replace_empty_answer(
            state: AgentState, runtime: Any
        ) -> dict[str, Any] | None:
            last = state["messages"][-1] if state["messages"] else None
            if not isinstance(last, AIMessage):
                return {"messages": [AIMessage(content=EMPTY_ANSWER_REPLY)]}
            text = last.text.strip()
            if text and not text.startswith(MODEL_LIMIT_NOTICE):
                return None
            # Same id: the messages reducer replaces the answer instead of appending.
            return {"messages": [AIMessage(content=EMPTY_ANSWER_REPLY, id=last.id)]}

        return [
            reject_long_input,
            ModelCallLimitMiddleware(
                run_limit=self.limits.model_call_limit, exit_behavior="end"
            ),
            ToolCallLimitMiddleware(run_limit=self.limits.tool_call_limit),
            replace_empty_answer,
        ]

    def check_pii(self) -> list[Guardrail]:
        """Mask card numbers and redact API keys, bearer tokens and JWTs (NFR-008).

        Only the owner's input is checked, before the model sees it, and the redacted
        text is what gets stored. Tool results are left alone because the owner may
        ask for the shop's own phone number. `mask` and `redact` never raise, unlike
        `block`, which would fail the turn.
        """
        return [
            PIIMiddleware("credit_card", strategy="mask", apply_to_input=True),
            PIIMiddleware(
                "api_key",
                detector=SECRET_PATTERN,
                strategy="redact",
                apply_to_input=True,
            ),
        ]

    def check_prompt_injection(self) -> list[Guardrail]:
        """Replace an answer that leaks internals with a safe Vietnamese reply.

        Internals are view names, scope settings, tool error codes and SQL. The answer
        is checked, not the input: injection is ordinary language, so a phrase list
        would miss real attacks and refuse honest messages, while a leaked internal is
        the visible result of an injection that worked.
        """

        @after_agent(name="LeakGuard")
        def replace_leaking_answer(
            state: AgentState, runtime: Any
        ) -> dict[str, Any] | None:
            last = state["messages"][-1] if state["messages"] else None
            if not isinstance(last, AIMessage) or not LEAK_PATTERN.search(last.text):
                return None
            return {"messages": [AIMessage(content=LEAK_REPLY, id=last.id)]}

        return [replace_leaking_answer]
