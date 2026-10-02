"""Deterministic guardrails for the shop agent, built from LangChain middleware.

`build_guardrails` returns the middleware in the order `create_agent` should run it.
`before_*` hooks run in list order and `after_*` hooks in reverse, so:

1. `AgentGuardrails.before_agent`: a latest owner message longer than
   `AGENT_MAX_INPUT_CHARS` ends the run with a short Vietnamese reply, before any model
   call.
2. `PIIMiddleware` on the owner's input only: card numbers are masked and API keys,
   bearer tokens and JWTs are redacted before the model sees them (NFR-008). Tool
   results are left alone because the owner may ask for the shop's own phone number.
   `redact` and `mask` never raise, unlike `block`, which would fail the turn.
3. `ModelCallLimitMiddleware` and `ToolCallLimitMiddleware`: at most
   `AGENT_MODEL_CALL_LIMIT` model calls and `AGENT_TOOL_CALL_LIMIT` tool calls per turn.
   Calls over the tool limit are refused and the model has to answer; reaching the model
   limit ends the run, and the output check replaces the English limit notice.
4. `AgentGuardrails.after_agent`: an empty answer, or one that leaks internals (view
   names, scope settings, error codes, a SELECT statement), is replaced with a safe
   Vietnamese reply.

A query the SQL guard or the database rejects needs no middleware: the `query_shop_data`
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

from langchain.agents.middleware import (
    AgentMiddleware,
    AgentState,
    ModelCallLimitMiddleware,
    PIIMiddleware,
    ToolCallLimitMiddleware,
    hook_config,
)
from langchain_core.messages import AIMessage, HumanMessage

from src.sql.guard import SqlGuard

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


def latest_human(messages: list) -> HumanMessage | None:
    # History is prepended to the request, so the owner's new message is the last one.
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            return message
    return None


class AgentGuardrails(AgentMiddleware):
    """Input length check before the agent runs, leak check on its final answer."""

    def __init__(self, max_input_chars: int) -> None:
        super().__init__()
        self.max_input_chars = max_input_chars

    @hook_config(can_jump_to=["end"])
    def before_agent(self, state: AgentState, runtime: Any) -> dict[str, Any] | None:
        latest = latest_human(state["messages"])
        if latest is None or len(latest.text) <= self.max_input_chars:
            return None
        reply = INPUT_TOO_LONG_REPLY.format(limit=self.max_input_chars)
        return {"messages": [AIMessage(content=reply)], "jump_to": "end"}

    def after_agent(self, state: AgentState, runtime: Any) -> dict[str, Any] | None:
        last = state["messages"][-1] if state["messages"] else None
        if not isinstance(last, AIMessage):
            return {"messages": [AIMessage(content=EMPTY_ANSWER_REPLY)]}
        text = last.text.strip()
        if not text or text.startswith(MODEL_LIMIT_NOTICE):
            replacement = EMPTY_ANSWER_REPLY
        elif LEAK_PATTERN.search(text):
            replacement = LEAK_REPLY
        else:
            return None
        # Same id: the messages reducer replaces the answer instead of appending.
        return {"messages": [AIMessage(content=replacement, id=last.id)]}


@dataclass(frozen=True)
class GuardrailLimits:
    """Per-turn guardrail limits; the composition root supplies them from config."""

    max_input_chars: int
    model_call_limit: int
    tool_call_limit: int


def build_guardrails(limits: GuardrailLimits) -> list[AgentMiddleware]:
    return [
        AgentGuardrails(limits.max_input_chars),
        PIIMiddleware("credit_card", strategy="mask", apply_to_input=True),
        PIIMiddleware(
            "api_key",
            detector=SECRET_PATTERN,
            strategy="redact",
            apply_to_input=True,
        ),
        ModelCallLimitMiddleware(
            run_limit=limits.model_call_limit, exit_behavior="end"
        ),
        ToolCallLimitMiddleware(run_limit=limits.tool_call_limit),
    ]
