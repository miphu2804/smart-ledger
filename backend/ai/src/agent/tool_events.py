"""Tool progress of one agent turn, as the owner's app sees it.

This is the only module that reads Pydantic AI's tool events. The app gets the tool
name and the call id, never the arguments (the SQL) or the result, so what a step says
is worded by the app.
"""

import logging
from dataclasses import dataclass

from pydantic_ai.messages import (
    AgentStreamEvent as ModelStreamEvent,
)
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    RetryPromptPart,
)

logger = logging.getLogger(__name__)
# Long enough for a SQL query or a run_code snippet, short enough for one log line.
LOG_PREVIEW_CHARS = 1000


@dataclass(frozen=True)
class ToolStarted:
    call_id: str
    name: str


@dataclass(frozen=True)
class ToolFinished:
    """A tool call ended, whether it returned or asked the model to retry."""

    call_id: str


def tool_progress(event: ModelStreamEvent) -> ToolStarted | ToolFinished | None:
    """The progress a Pydantic AI event carries, or None for any other event."""
    if isinstance(event, FunctionToolCallEvent):
        return ToolStarted(call_id=event.tool_call_id, name=event.part.tool_name)
    if isinstance(event, FunctionToolResultEvent):
        return ToolFinished(call_id=event.tool_call_id)
    return None


def log_tool_event(event: ModelStreamEvent) -> None:
    """Log each tool call with its arguments and outcome, so a turn can be traced on
    the server. A retry (a rejected query, a sandbox error) logs at WARNING."""
    if isinstance(event, FunctionToolCallEvent):
        logger.info(
            "tool call %s [%s] args=%s",
            event.part.tool_name,
            event.tool_call_id,
            _preview(event.part.args_as_json_str()),
        )
    elif isinstance(event, FunctionToolResultEvent):
        part = event.part
        if isinstance(part, RetryPromptPart):
            logger.warning(
                "tool retry %s [%s]: %s",
                part.tool_name,
                event.tool_call_id,
                _preview(part.model_response()),
            )
        else:
            logger.info(
                "tool done %s [%s] result=%s",
                part.tool_name,
                event.tool_call_id,
                _preview(part.model_response_str()),
            )


def _preview(text: str) -> str:
    if len(text) <= LOG_PREVIEW_CHARS:
        return text
    return f"{text[:LOG_PREVIEW_CHARS]}... ({len(text)} chars)"
