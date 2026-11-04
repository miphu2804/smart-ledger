from src.memory.service import AgentMemoryService


class WithoutMemoryWrites:
    """The memory service as the agent sees it, with recall but no writes.

    A turn would otherwise store what it learned and change the next run's answers.
    Every attribute but `remember` is the service's own.
    """

    def __init__(self, memory: AgentMemoryService) -> None:
        self.memory = memory

    def __getattr__(self, name: str):
        return getattr(self.memory, name)

    async def remember(self, *arguments, **keywords) -> None:
        return None
