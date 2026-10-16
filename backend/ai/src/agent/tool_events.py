"""Tool progress of one agent turn, as the owner's app sees it.

This is the only module that reads Pydantic AI's tool events. The app gets the tool
name and the call id, never the arguments (the SQL) or the result, so what a step says
is worded by the app.
"""

from dataclasses import dataclass

from pydantic_ai.messages import (
    AgentStreamEvent as ModelStreamEvent,
)
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
)


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
