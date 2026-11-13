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
import uuid
from collections import OrderedDict

from pydantic_ai import Agent, Embedder, PromptedOutput
from pydantic_ai.models import Model

from src.llm.session_settings import session_settings
from src.memory.fact_rules import (
    MemoryDecisions,
    MemoryFact,
    MemoryFacts,
    MemorySummary,
    reconciled,
    screened_extraction,
    without_phone_numbers,
)
from src.memory.repository import (
    AgentMemory,
    AgentMemoryRepository,
    MemoryGroup,
    NewMemory,
    RecalledMemory,
)
from src.observability import Observability
from src.prompt_templates import (
    MEMORY_CONTEXT,
    MEMORY_EXTRACT_INPUT,
    MEMORY_EXTRACT_PROMPT,
    MEMORY_RECONCILE_INPUT,
    MEMORY_RECONCILE_PROMPT,
    MEMORY_SUMMARY_INPUT,
    MEMORY_SUMMARY_PROMPT,
)
from src.utils import get_time

# A failure here can carry the extractor model's output, which names customers, so
# WARNING keeps the error type and the traceback goes to DEBUG.
logger = logging.getLogger(__name__)


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
    # Question vectors kept in memory: the Bobi sheet's quick chips repeat the same
    # texts, and one process serves the AI, so no shared cache is needed.
    QUERY_CACHE_SIZE = 256

    def __init__(
        self,
        model: Model,
        repository: AgentMemoryRepository,
        embedder: Embedder,
        allowed_types: frozenset[str],
        recall_limit: int = 5,
        preference_limit: int = 10,
        observability: Observability | None = None,
    ) -> None:
        self.observability = observability or Observability()
        self.repository = repository
        self.embedder = embedder
        # Memory types the model may write on its own.
        self.allowed_types = allowed_types
        # Tencent's search returns LIMIT 5.
        self.recall_limit = recall_limit
        # Standing preferences sent every turn on top of the search, so a growing list
        # cannot crowd the prompt.
        self.preference_limit = preference_limit
        self.query_vectors: OrderedDict[str, list[float]] = OrderedDict()
        # Held by the one `remember` that is writing; the lock wakes waiters in the
        # order they arrived.
        self.writing = asyncio.Lock()
        # Writes started by remember_in_background; held here so they are not garbage
        # collected mid-run.
        self.writes: set[asyncio.Task] = set()
        # Prompted JSON works on every provider, including those that reject native
        # structured output.
        self.extractor = Agent(
            model,
            name="memory-extractor",
            output_type=PromptedOutput(MemoryFacts),
            instructions=MEMORY_EXTRACT_PROMPT,
        )
        self.reconciler = Agent(
            model,
            name="memory-reconciler",
            output_type=PromptedOutput(MemoryDecisions),
            instructions=MEMORY_RECONCILE_PROMPT,
        )
        self.summarizer = Agent(
            model,
            name="memory-summarizer",
            output_type=PromptedOutput(MemorySummary),
            instructions=MEMORY_SUMMARY_PROMPT,
        )

    async def with_memories(
        self, shop_id: int, user_id: int, message: str
    ) -> tuple[str, list[RecalledMemory]]:
        """Return `message` led by the owner's best memories, and those memories.

        An owner who switched memory off or has none, a failed search or no match
        answers without memories rather than failing the turn.
        """
        try:
            # Checked before the embedding call, so the question of an owner who
            # switched memory off never reaches the embedding provider, and an owner
            # without memories skips the call.
            with self.observability.span("memory ready", metadata={"shop_id": shop_id}):
                ready = await asyncio.to_thread(
                    self.repository.recall_ready, shop_id, user_id
                )
                self.observability.enrich_span(outputs={"ready": ready})
            if not ready:
                return message, []
            memories = await self._recall(shop_id, user_id, message)
        except Exception as error:
            logger.warning(
                "memory not recalled: shop=%s (%s)", shop_id, type(error).__name__
            )
            logger.debug("memory not recalled: shop=%s", shop_id, exc_info=True)
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

    def remember_in_background(
        self,
        shop_id: int,
        user_id: int,
        conversation_id: int,
        question: str,
        answer: str,
        recalled: list[RecalledMemory],
    ) -> None:
        """Start `remember` without making the owner wait for it."""
        task = asyncio.create_task(
            self.remember(shop_id, user_id, conversation_id, question, answer, recalled)
        )
        self.writes.add(task)
        task.add_done_callback(self.writes.discard)

    async def finish_writes(self, timeout: float) -> None:
        """Wait up to `timeout` seconds for running writes, then cancel the rest.

        Cancelled writes are awaited, so none is still writing when the caller closes
        the database pool.
        """
        if not self.writes:
            return
        _, unfinished = await asyncio.wait(self.writes, timeout=timeout)
        if unfinished:
            for task in unfinished:
                task.cancel()
            logger.warning("memory writes cancelled at shutdown: %d", len(unfinished))
            await asyncio.gather(*unfinished, return_exceptions=True)

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
        memories the turn used: their use is recorded here, off the recall path, and
        the model skips them and may mark one a new fact replaces.

        Exchanges are written one at a time in the order their turns ended. An owner's
        follow-up is then checked against the facts the turn before it stored, where
        two writes side by side each missed the other's and kept the same fact twice,
        and a burst of turns runs one write's model calls beside live chat, not one
        set per turn.
        """
        async with self.writing:
            if recalled:
                await self._mark_used(shop_id, user_id, recalled)
            try:
                if not await self.memory_enabled(shop_id, user_id):
                    return
            except Exception as error:
                logger.warning(
                    "memory not stored: shop=%s (%s)", shop_id, type(error).__name__
                )
                logger.debug("memory not stored: shop=%s", shop_id, exc_info=True)
                return
            await self._store(
                shop_id, user_id, conversation_id, question, answer, recalled
            )
            await self._summarize(shop_id, user_id)

    async def _mark_used(
        self, shop_id: int, user_id: int, recalled: list[RecalledMemory]
    ) -> None:
        try:
            await asyncio.to_thread(
                self.repository.mark_used,
                shop_id,
                user_id,
                [memory.id for memory in recalled],
            )
        except Exception as error:
            logger.warning(
                "memory use not recorded: shop=%s (%s)", shop_id, type(error).__name__
            )
            logger.debug("memory use not recorded: shop=%s", shop_id, exc_info=True)

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
            facts = await self._extract(shop_id, question, answer, recalled)
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
        except Exception as error:
            logger.warning(
                "memory not stored: shop=%s conversation=%s (%s)",
                shop_id,
                conversation_id,
                type(error).__name__,
            )
            logger.debug(
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
                model_settings=session_settings(uuid.uuid4().hex, shop_id),
                # Filters one shop's memory spans, like the chat agent's.
                metadata={"shop_id": shop_id},
            )
        except Exception as error:
            logger.warning(
                "memory not reconciled: shop=%s (%s)", shop_id, type(error).__name__
            )
            logger.debug("memory not reconciled: shop=%s", shop_id, exc_info=True)
            return memories
        checked = reconciled(
            open_facts,
            result.output.decisions,
            {memory.id for memory in similar},
        )
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
        except Exception as error:
            logger.warning(
                "memory not summarized: shop=%s (%s)", shop_id, type(error).__name__
            )
            logger.debug("memory not summarized: shop=%s", shop_id, exc_info=True)

    async def _summarize_group(
        self, shop_id: int, user_id: int, group: MemoryGroup
    ) -> None:
        listed = "\n".join(
            f"- {memory.memory_type}, importance {memory.importance}: {memory.content}"
            for memory in group.memories
        )
        result = await self.summarizer.run(
            MEMORY_SUMMARY_INPUT.format(day=group.day.isoformat(), facts=listed),
            model_settings=session_settings(uuid.uuid4().hex, shop_id),
            metadata={"shop_id": shop_id},
        )
        facts = without_phone_numbers(result.output.facts)
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

    async def _query_vector(self, message: str) -> list[float]:
        if message in self.query_vectors:
            self.query_vectors.move_to_end(message)
            return self.query_vectors[message]
        vector = list((await self.embedder.embed_query(message))[0])
        self.query_vectors[message] = vector
        if len(self.query_vectors) > self.QUERY_CACHE_SIZE:
            self.query_vectors.popitem(last=False)
        return vector

    async def _recall(
        self, shop_id: int, user_id: int, message: str
    ) -> list[RecalledMemory]:
        # The span shows which memories the model was handed; the embedding call
        # inside it is already traced on its own.
        with self.observability.span(
            "memory recall", inputs={"question": message}, metadata={"shop_id": shop_id}
        ):
            query = await self._query_vector(message)
            memories = await asyncio.to_thread(
                self.repository.search,
                shop_id,
                user_id,
                query,
                self.recall_limit,
                self.preference_limit,
                message,
            )
            self.observability.enrich_span(
                outputs={
                    "memories": [
                        {
                            "id": memory.id,
                            "content": memory.content,
                            "memory_type": memory.memory_type,
                            "score": memory.relevance,
                        }
                        for memory in memories
                    ]
                },
                metrics={"recalled_count": len(memories)},
            )
            return memories

    async def _extract(
        self, shop_id: int, question: str, answer: str, recalled: list[RecalledMemory]
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
            model_settings=session_settings(uuid.uuid4().hex, shop_id),
            metadata={"shop_id": shop_id},
        )
        return screened_extraction(
            result.output.facts,
            self.allowed_types,
            {memory.id for memory in recalled},
        )
