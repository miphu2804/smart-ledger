"""Long-term memory of the shop agent (ADR-0002), on Tencent's agent-memory pattern.

Reading is Tencent's flow (Agent Long-Term Memory and Agentic RAG guides): before the
model answers, code searches the owner's memories for the current message, weighs them
by Tencent's decay and places them before the question as reference material. Writing
appends records with Tencent's INSERT; Tencent leaves open how a memory's text is
produced, so here a model distills each saved exchange into a few facts. Tencent's
compression then has a model merge the owner's memories older than 7 days.
"""

import asyncio
import logging
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent, Embedder, PromptedOutput
from pydantic_ai.models import Model

from src.memory.repository import (
    AgentMemoryRepository,
    MemoryGroup,
    NewMemory,
    RecalledMemory,
)
from src.prompt_templates import (
    MEMORY_CONTEXT,
    MEMORY_EXTRACT_INPUT,
    MEMORY_EXTRACT_PROMPT,
    MEMORY_SUMMARY_INPUT,
    MEMORY_SUMMARY_PROMPT,
)
from src.utils import get_time

logger = logging.getLogger(__name__)


class MemoryFact(BaseModel):
    """One fact the extraction model proposes."""

    memory_type: Literal["preference", "semantic", "procedural", "episodic"]
    content: str = Field(min_length=1, max_length=500)
    importance: float = Field(ge=0, le=1)


class MemoryFacts(BaseModel):
    """Structured output schema the extraction model must return."""

    facts: list[MemoryFact] = Field(max_length=5)


class MemorySummary(BaseModel):
    """Structured output schema of a summary: never empty, so nothing is lost."""

    facts: list[MemoryFact] = Field(min_length=1, max_length=5)


class AgentMemoryService:
    # Tencent compresses memories older than 7 days.
    SUMMARY_AGE_DAYS = 7
    # Groups summarized after one turn, so a backlog costs a few model calls per turn.
    SUMMARY_GROUPS_PER_TURN = 3

    def __init__(
        self,
        model: Model,
        repository: AgentMemoryRepository,
        embedder: Embedder,
        recall_limit: int = 5,
    ) -> None:
        self.repository = repository
        self.embedder = embedder
        # Tencent's search returns LIMIT 5.
        self.recall_limit = recall_limit
        # Prompted JSON works on every provider; the Anthropic models behind the
        # gateway reject native structured output.
        self.extractor = Agent(
            model,
            output_type=PromptedOutput(MemoryFacts),
            instructions=MEMORY_EXTRACT_PROMPT,
        )
        self.summarizer = Agent(
            model,
            output_type=PromptedOutput(MemorySummary),
            instructions=MEMORY_SUMMARY_PROMPT,
        )

    async def with_memories(self, shop_id: int, user_id: int, message: str) -> str:
        """Return `message` led by the owner's most relevant memories, if any.

        A failed search answers without memories rather than failing the turn.
        """
        try:
            memories = await self._recall(shop_id, user_id, message)
        except Exception:
            logger.warning("memory not recalled: shop=%s", shop_id, exc_info=True)
            return message
        if not memories:
            return message
        facts = "\n".join(
            f"- ({get_time(memory.created_at).date().isoformat()}) {memory.content}"
            for memory in memories
        )
        return MEMORY_CONTEXT.format(facts=facts, message=message)

    async def remember(
        self,
        shop_id: int,
        user_id: int,
        conversation_id: int,
        question: str,
        answer: str,
    ) -> None:
        """Store what the exchange taught, then compress the owner's old memories.

        Runs after the turn is saved, so the owner never waits for it. A failure in
        either step is logged, never raised, so a broken memory step cannot fail a
        chat.
        """
        await self._store(shop_id, user_id, conversation_id, question, answer)
        await self._summarize(shop_id, user_id)

    async def _store(
        self,
        shop_id: int,
        user_id: int,
        conversation_id: int,
        question: str,
        answer: str,
    ) -> None:
        try:
            facts = await self._extract(question, answer)
            if not facts:
                return
            await asyncio.to_thread(
                self.repository.add,
                shop_id,
                user_id,
                conversation_id,
                await self._embed(facts),
            )
            logger.info(
                "memory stored: shop=%s conversation=%s facts=%d",
                shop_id,
                conversation_id,
                len(facts),
            )
        except Exception:
            logger.warning(
                "memory not stored: shop=%s conversation=%s",
                shop_id,
                conversation_id,
                exc_info=True,
            )

    async def _summarize(self, shop_id: int, user_id: int) -> None:
        try:
            groups = await asyncio.to_thread(
                self.repository.due_for_summary,
                shop_id,
                user_id,
                self.SUMMARY_AGE_DAYS,
            )
            for group in groups[: self.SUMMARY_GROUPS_PER_TURN]:
                await self._summarize_group(shop_id, user_id, group)
        except Exception:
            logger.warning("memory not summarized: shop=%s", shop_id, exc_info=True)

    async def _summarize_group(
        self, shop_id: int, user_id: int, group: MemoryGroup
    ) -> None:
        listed = "\n".join(
            f"- {memory.memory_type}, importance {memory.importance}: {memory.content}"
            for memory in group.memories
        )
        result = await self.summarizer.run(
            MEMORY_SUMMARY_INPUT.format(day=group.day.isoformat(), facts=listed)
        )
        replaced = await asyncio.to_thread(
            self.repository.replace,
            shop_id,
            user_id,
            group,
            await self._embed(result.output.facts),
        )
        logger.info(
            "memory summarized: shop=%s conversation=%s from=%d to=%d replaced=%s",
            shop_id,
            group.conversation_id,
            len(group.memories),
            len(result.output.facts),
            replaced,
        )

    async def _embed(self, facts: list[MemoryFact]) -> list[NewMemory]:
        vectors = await self.embedder.embed_documents([fact.content for fact in facts])
        return [
            NewMemory(fact.memory_type, fact.content, fact.importance, list(vector))
            for fact, vector in zip(facts, vectors.embeddings, strict=True)
        ]

    async def _recall(
        self, shop_id: int, user_id: int, message: str
    ) -> list[RecalledMemory]:
        query = await self.embedder.embed_query(message)
        return await asyncio.to_thread(
            self.repository.search,
            shop_id,
            user_id,
            list(query[0]),
            self.recall_limit,
        )

    async def _extract(self, question: str, answer: str) -> list[MemoryFact]:
        result = await self.extractor.run(
            MEMORY_EXTRACT_INPUT.format(
                today=get_time().date().isoformat(), question=question, answer=answer
            )
        )
        return result.output.facts
