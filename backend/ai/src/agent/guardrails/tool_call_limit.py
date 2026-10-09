from dataclasses import dataclass
from typing import Any

from pydantic_ai import RunContext, ToolFailed
from pydantic_ai.capabilities import AbstractCapability, ValidatedToolArgs
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

# What the model reads for a refused tool call.
TOOL_LIMIT_NOTICE = (
    "Tool call limit reached for this turn. Answer with the data you already have."
)


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
