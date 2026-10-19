"""The sandbox option: the Harness Code Mode capability behind a thin wrapper.

This is the only module that imports `pydantic_ai_harness.CodeMode` (the Monty
sandbox), so the rest of the service and its tests import cleanly without the
`codemode` extra. The sandbox is an agent option on its own: it folds whichever tool
names it is given into one `run_code` tool and knows nothing about the calculation
service or any other tool owner. Monty runs only when the model actually writes a
`run_code` snippet.

Monty enforces the memory value as its heap limit: an allocation past it raises
`MemoryError` inside the snippet, and Code Mode returns that to the model as a retry,
so a runaway program costs a retry, not a worker. The value stays a backstop for the
sandbox heap, not a process RAM limit; the OS or container limit is the last bound.
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SandboxLimits:
    """What the sandbox folds in, and how much of the host it may use; the
    composition root supplies both from config."""

    tools: tuple[str, ...]
    max_memory_bytes: int
    max_duration_secs: float
    max_tool_calls: int
    max_suspensions: int


class Sandbox:
    """The agent capability that runs model-written code with the given limits."""

    def __init__(self, limits: SandboxLimits) -> None:
        try:
            from pydantic_ai_harness import CodeMode
        except ImportError as error:
            raise RuntimeError(
                "sandbox enabled but the codemode extra is missing"
            ) from error
        self._capability = CodeMode(
            tools=list(limits.tools),
            max_tool_calls=limits.max_tool_calls,
            resource_limits={
                "max_duration_secs": limits.max_duration_secs,
                "max_memory": limits.max_memory_bytes,
                "max_suspensions": limits.max_suspensions,
            },
        )

    @property
    def capability(self):
        """The capability object the agent takes in its capabilities list."""
        return self._capability
