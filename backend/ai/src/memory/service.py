"""Long-term memory of the shop agent (ADR-0002), on Tencent's agent-memory pattern.

Reading is Tencent's flow (Agent Long-Term Memory and Agentic RAG guides): before the
model answers, code searches the owner's memories for the current message, weighs them
by Tencent's decay and places them before the question as reference material. The
owner's standing preferences lead every turn whatever the message, like the always
loaded MEMORY.md of Cognition's agent memory repo. Writing
appends records with Tencent's INSERT; Tencent leaves open how a memory's text is
produced, so here a model distills each saved exchange into a few facts, and, after
Hy Memory's reconcile, checks them against the owner's similar memories so an update
replaces the old fact instead of sitting beside it. Tencent's compression then has a
model merge the owner's memories older than 7 days.
"""

import asyncio
import logging
import re
import uuid
from dataclasses import replace
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent, Embedder, PromptedOutput
from pydantic_ai.models import Model

from src.memory.repository import (
    AgentMemory,
    AgentMemoryRepository,
    MemoryGroup,
    NewMemory,
    RecalledMemory,
)
from src.prompt_templates import (
    MEMORY_CONTEXT,
    MEMORY_EXTRACT_INPUT,
    MEMORY_EXTRACT_PROMPT,
    MEMORY_RECONCILE_INPUT,
    MEMORY_RECONCILE_PROMPT,
    MEMORY_SUMMARY_INPUT,
    MEMORY_SUMMARY_PROMPT,
)
from src.providers.factory import session_settings
from src.utils import get_time

logger = logging.getLogger(__name__)

# A Vietnamese phone number: 0, 84 or +84, then nine digits that spaces, dots or
# dashes may split. The lookbehind keeps a digit run inside a longer number, such as
# the money amount "120.000.000đ", from matching.
PHONE_NUMBER = re.compile(r"(?<![\d.,])(?:\+84|84|0)(?:[\s.\-]?\d){9}(?!\d)")


class MemoryFact(BaseModel):
    """One fact the extraction model proposes."""

    memory_type: Literal["preference", "semantic", "procedural", "episodic"]
    content: str = Field(min_length=1, max_length=500)
    importance: float = Field(ge=0, le=1)
    # Id of an "Already remembered" fact this one corrects or updates.
    replaces: int | None = None


class MemoryFacts(BaseModel):
    """Structured output schema the extraction model must return."""

    facts: list[MemoryFact] = Field(max_length=5)


class MemorySummary(BaseModel):
    """Structured output schema of a summary: never empty, so nothing is lost."""

    facts: list[MemoryFact] = Field(min_length=1, max_length=5)


class MemoryDecision(BaseModel):
    """What one new fact does to the remembered ones, after Hy Memory's reconcile."""

    # 1-based number of the new fact, as listed to the model.
    fact: int
    action: Literal["new", "replaces", "known"]
    replaces: int | None = None


class MemoryDecisions(BaseModel):
    """Structured output schema the reconcile model must return."""

    decisions: list[MemoryDecision] = Field(max_length=5)


class AgentMemoryService:
    # Tencent compresses memories older than 7 days.
    SUMMARY_AGE_DAYS = 7
    # Groups summarized after one turn, so a backlog costs a few model calls per turn.
    SUMMARY_GROUPS_PER_TURN = 3
    # Cosine relevance from which a remembered fact may be about the same thing as a
    # new one. Measured on 2026-10-17 with embeddinggemma-300m on 14 owner-style
    # pairs: same-subject pairs scored 0.66-0.95, unrelated ones 0.53-0.67, and an
    # extracted supplier change scored 0.65 against the fact it updates. The low bar
    # only picks candidates; the reconcile model keeps different things apart.
    RECONCILE_MIN_RELEVANCE = 0.6
    # Remembered facts checked per new fact.
    RECONCILE_CANDIDATES = 3

    def __init__(
        self,
        model: Model,
        repository: AgentMemoryRepository,
        embedder: Embedder,
        allowed_types: frozenset[str],
        recall_limit: int = 5,
        preference_limit: int = 10,
    ) -> None:
        self.repository = repository
        self.embedder = embedder
        # Memory types the model may write on its own.
        self.allowed_types = allowed_types
        # Tencent's search returns LIMIT 5.
        self.recall_limit = recall_limit
        # Standing preferences sent every turn on top of the search, so a growing list
        # cannot crowd the prompt.
        self.preference_limit = preference_limit
        # Prompted JSON works on every provider; the Anthropic models behind the
        # gateway reject native structured output.
        self.extractor = Agent(
            model,
            output_type=PromptedOutput(MemoryFacts),
            instructions=MEMORY_EXTRACT_PROMPT,
        )
        self.reconciler = Agent(
            model,
            output_type=PromptedOutput(MemoryDecisions),
            instructions=MEMORY_RECONCILE_PROMPT,
        )
        self.summarizer = Agent(
            model,
            output_type=PromptedOutput(MemorySummary),
            instructions=MEMORY_SUMMARY_PROMPT,
        )

    async def with_memories(
        self, shop_id: int, user_id: int, message: str
    ) -> tuple[str, list[RecalledMemory]]:
        """Return `message` led by the owner's best memories, and those memories.

        An owner who switched memory off, a failed search or no match answers without
        memories rather than failing the turn.
        """
        try:
            if not await self.memory_enabled(shop_id, user_id):
                return message, []
            memories = await self._recall(shop_id, user_id, message)
        except Exception:
            logger.warning("memory not recalled: shop=%s", shop_id, exc_info=True)
            return message, []
        if not memories:
            return message, []
        facts = "\n".join(
            f"- ({get_time(memory.created_at).date().isoformat()},"
            f" {memory.memory_type}) {memory.content}"
            for memory in memories
        )
        return MEMORY_CONTEXT.format(facts=facts, message=message), memories

    async def memory_enabled(self, shop_id: int, user_id: int) -> bool:
        return await asyncio.to_thread(self.repository.memory_enabled, shop_id, user_id)

    async def set_memory_enabled(
        self, shop_id: int, user_id: int, enabled: bool
    ) -> None:
        await asyncio.to_thread(
            self.repository.set_memory_enabled, shop_id, user_id, enabled
        )

    async def list_memories(self, shop_id: int, user_id: int) -> list[AgentMemory]:
        return await asyncio.to_thread(self.repository.list_live, shop_id, user_id)

    async def forget(self, shop_id: int, user_id: int, memory_id: int) -> bool:
        return await asyncio.to_thread(
            self.repository.forget, shop_id, user_id, memory_id
        )

    async def remember(
        self,
        shop_id: int,
        user_id: int,
        conversation_id: int,
        question: str,
        answer: str,
        recalled: list[RecalledMemory],
    ) -> None:
        """Store what the exchange taught, then compress the owner's old memories.

        Runs after the turn is saved, so the owner never waits for it. A failure in
        either step is logged, never raised, so a broken memory step cannot fail a
        chat. Does nothing for an owner who switched memory off. `recalled` are the
        memories the turn used: the model skips them and may mark one a new fact
        replaces.
        """
        try:
            if not await self.memory_enabled(shop_id, user_id):
                return
        except Exception:
            logger.warning("memory not stored: shop=%s", shop_id, exc_info=True)
            return
        await self._store(shop_id, user_id, conversation_id, question, answer, recalled)
        await self._summarize(shop_id, user_id)

    async def _store(
        self,
        shop_id: int,
        user_id: int,
        conversation_id: int,
        question: str,
        answer: str,
        recalled: list[RecalledMemory],
    ) -> None:
        try:
            facts = await self._extract(question, answer, recalled)
            if not facts:
                return
            memories = await self._reconcile(
                shop_id, user_id, await self._embed(facts), recalled
            )
            if not memories:
                return
            await asyncio.to_thread(
                self.repository.add, shop_id, user_id, conversation_id, memories
            )
            logger.info(
                "memory stored: shop=%s conversation=%s facts=%d",
                shop_id,
                conversation_id,
                len(memories),
            )
        except Exception:
            logger.warning(
                "memory not stored: shop=%s conversation=%s",
                shop_id,
                conversation_id,
                exc_info=True,
            )

    async def _reconcile(
        self,
        shop_id: int,
        user_id: int,
        memories: list[NewMemory],
        recalled: list[RecalledMemory],
    ) -> list[NewMemory]:
        """`memories` checked against the owner's similar memories the turn missed.

        The extractor saw only what the turn recalled, which follows the message, so
        an update to a memory about another topic would sit next to it as a second
        version. After Hy Memory's reconcile, each new fact's nearest remembered ones
        go to a model that marks the fact new, a replacement or already known. Facts
        that already replace a recalled memory are kept as they are. A failed check
        stores the facts unchecked rather than lose them.
        """
        open_facts = [memory for memory in memories if memory.supersedes is None]
        if not open_facts:
            return memories
        try:
            similar = await asyncio.to_thread(
                self.repository.similar,
                shop_id,
                user_id,
                [memory.embedding for memory in open_facts],
                self.RECONCILE_MIN_RELEVANCE,
                self.RECONCILE_CANDIDATES,
                [memory.id for memory in recalled],
            )
            if not similar:
                return memories
            result = await self.reconciler.run(
                MEMORY_RECONCILE_INPUT.format(
                    remembered="\n".join(
                        f"[{memory.id}] {memory.content}" for memory in similar
                    ),
                    facts="\n".join(
                        f"{number}. {memory.content}"
                        for number, memory in enumerate(open_facts, 1)
                    ),
                ),
                model_settings=session_settings(uuid.uuid4().hex),
            )
        except Exception:
            logger.warning("memory not reconciled: shop=%s", shop_id, exc_info=True)
            return memories
        decisions = {decision.fact: decision for decision in result.output.decisions}
        known_ids = {memory.id for memory in similar}
        checked = []
        for number, memory in enumerate(open_facts, 1):
            decision = decisions.get(number)
            if decision is not None and decision.action == "known":
                continue
            # Only a memory shown to the model may be replaced.
            if (
                decision is not None
                and decision.action == "replaces"
                and decision.replaces in known_ids
            ):
                memory = replace(memory, supersedes=decision.replaces)
            checked.append(memory)
        logger.info(
            "memory reconciled: shop=%s candidates=%d facts=%d kept=%d replaced=%d",
            shop_id,
            len(similar),
            len(open_facts),
            len(checked),
            sum(memory.supersedes is not None for memory in checked),
        )
        superseding = [memory for memory in memories if memory.supersedes is not None]
        return superseding + checked

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
            MEMORY_SUMMARY_INPUT.format(day=group.day.isoformat(), facts=listed),
            model_settings=session_settings(uuid.uuid4().hex),
        )
        facts = [
            fact
            for fact in result.output.facts
            if not PHONE_NUMBER.search(fact.content)
        ]
        # Replacing with nothing would forget the group, so it stays for a later turn.
        if not facts:
            return
        replaced = await asyncio.to_thread(
            self.repository.replace,
            shop_id,
            user_id,
            group,
            await self._embed(facts),
        )
        logger.info(
            "memory summarized: shop=%s conversation=%s from=%d to=%d replaced=%s",
            shop_id,
            group.conversation_id,
            len(group.memories),
            len(facts),
            replaced,
        )

    async def _embed(self, facts: list[MemoryFact]) -> list[NewMemory]:
        vectors = await self.embedder.embed_documents([fact.content for fact in facts])
        return [
            NewMemory(
                fact.memory_type,
                fact.content,
                fact.importance,
                list(vector),
                fact.replaces,
            )
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
            self.preference_limit,
            message,
        )

    async def _extract(
        self, question: str, answer: str, recalled: list[RecalledMemory]
    ) -> list[MemoryFact]:
        result = await self.extractor.run(
            MEMORY_EXTRACT_INPUT.format(
                today=get_time().date().isoformat(),
                remembered="\n".join(
                    f"[{memory.id}] {memory.content}" for memory in recalled
                )
                or "(nothing)",
                question=question,
                answer=answer,
            ),
            # The gateway rejects a request without a session; each call stands alone.
            model_settings=session_settings(uuid.uuid4().hex),
        )
        known = {memory.id for memory in recalled}
        # The model could name any id; only a memory this turn recalled may be replaced.
        # Types and phone numbers are screened here too, because the prompt alone does
        # not bind the model.
        return [
            fact.model_copy(
                update={"replaces": fact.replaces if fact.replaces in known else None}
            )
            for fact in result.output.facts
            if fact.memory_type in self.allowed_types
            and not PHONE_NUMBER.search(fact.content)
        ]
