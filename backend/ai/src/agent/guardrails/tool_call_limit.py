from dataclasses import dataclass
from typing import Any, ClassVar

from pydantic_ai import RunContext, ToolFailed
from pydantic_ai.capabilities import AbstractCapability, ValidatedToolArgs
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition


@dataclass
class ToolCallLimit(AbstractCapability[Any]):
    """Run at most `limit` tool calls per turn, then leave the model only an answer.

    Pydantic AI's own `tool_calls_limit` ends the run when a parallel batch would cross
    the limit; this runs the batch's first calls and refuses the rest, so the model can
    still answer from the data it got. Calls are counted as they start, so the count
    holds while one batch runs concurrently.

    Tools named in `exempt` stay callable past the limit: they are pure in-process
    tools (the calculate tool) that do no I/O, so calling them cannot multiply the
    database load the limit guards, and the calculation prompt tells the model to run
    every sum through calculate.
    """

    # What the model reads for a refused tool call.
    NOTICE: ClassVar[str] = (
        "Tool call limit reached for this turn. Answer with the data you already have."
    )

    limit: int
    exempt: frozenset[str] = frozenset()
    started: int = 0

    async def for_run(self, ctx: RunContext[Any]) -> "ToolCallLimit":
        # Chat turns run concurrently, so each run counts its own calls.
        return ToolCallLimit(self.limit, exempt=self.exempt)

    async def prepare_tools(
        self, ctx: RunContext[Any], tool_defs: list[ToolDefinition]
    ) -> list[ToolDefinition]:
        if self.started < self.limit:
            return tool_defs
        # Only the exempt tools stay offered, so the model can still calculate.
        return [tool_def for tool_def in tool_defs if tool_def.name in self.exempt]

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: ValidatedToolArgs,
    ) -> ValidatedToolArgs:
        if tool_def.name in self.exempt:
            return args
        if self.started >= self.limit:
            raise ToolFailed(self.NOTICE)
        self.started += 1
        return args
