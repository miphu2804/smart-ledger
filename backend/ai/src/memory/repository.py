from dataclasses import dataclass
from datetime import date, datetime, timedelta
from itertools import groupby

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Select,
    String,
    Text,
    delete,
    extract,
    func,
    null,
    or_,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB, insert
from sqlalchemy.orm import Mapped, load_only, mapped_column

from src.infra.postgre_db_client import Base, PostgreDBClient
from src.utils import SHOP_TIMEZONE

# Size of agent_memories.embedding, fixed by its migration; every embedder is cut to it.
EMBEDDING_DIMENSIONS = 384


class AgentMemory(Base):
    __tablename__ = "agent_memories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    shop_id: Mapped[int] = mapped_column(BigInteger)
    user_id: Mapped[int] = mapped_column(BigInteger)
    source_conversation_id: Mapped[int] = mapped_column(BigInteger)
    memory_type: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    importance: Mapped[float] = mapped_column(Float)
    # `metadata` is reserved on declarative classes, hence the attribute name.
    details: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    superseded_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("agent_memories.id")
    )


class AgentMemorySetting(Base):
    __tablename__ = "agent_memory_settings"

    shop_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    memory_enabled: Mapped[bool] = mapped_column(Boolean)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


@dataclass(frozen=True)
class NewMemory:
    memory_type: str
    content: str
    importance: float
    embedding: list[float]
    # Id of a recalled memory this one corrects; that memory stops being recalled.
    supersedes: int | None = None


@dataclass(frozen=True)
class RecalledMemory:
    id: int
    content: str
    memory_type: str
    created_at: datetime
    # Cosine relevance to the message; None for a standing preference, which is
    # recalled whatever the message is.
    relevance: float | None
    # The chat the memory came from, so the owner can open it from the reply.
    source_conversation_id: int


@dataclass(frozen=True)
class StoredMemory:
    id: int
    memory_type: str
    content: str
    importance: float
    created_at: datetime


@dataclass(frozen=True)
class MemoryGroup:
    """Old memories one conversation produced on one shop day, to be summarized."""

    conversation_id: int
    day: date
    memories: list[StoredMemory]


class AgentMemoryRepository:
    """Reads and appends one owner's memories; every statement is scoped to them."""

    # Tencent's decay rate: a memory keeps exp(-0.01) of its weight per day of age.
    DECAY_PER_DAY = 0.01
    # Nearest memories by cosine that decay then re-ranks; the HNSW index serves this.
    CANDIDATES = 20
    # Marks a summary, so it is never summarized again.
    SUMMARY_KEY = "summarized_from"
    # Most memories the owner's view lists; the map cannot draw many more, and the
    # least recently used ones are the ones left out.
    LIST_LIMIT = 200

    def __init__(self, postgres: PostgreDBClient) -> None:
        self.postgres = postgres

    def search(
        self,
        shop_id: int,
        user_id: int,
        query: list[float],
        limit: int,
        preference_limit: int = 0,
    ) -> list[RecalledMemory]:
        """The owner's standing preferences, then Tencent's semantic search re-ranked
        by Tencent's decay.

        Up to `preference_limit` live preferences come first, most important and newest
        first, whatever the message: "answer in tables" rarely resembles the question
        it should shape, so similarity alone would miss it. This follows the always
        loaded MEMORY.md of Cognition's agent memory repo. The search then fills
        `limit` more from the other memories.

        "Agent Long-Term Memory", Feature Overview: skip expired rows, take the nearest
        by cosine distance with relevance as 1 - distance, and weigh each memory by
        importance * exp(-0.01 * age in days). Tencent shows the two as separate
        queries; here the decay weight multiplies the relevance of the cosine
        candidates, so an old or minor memory yields to a fresh, important one about
        the same thing. The shop and user replace Tencent's agent_id filter, and both
        come from the request.

        Departures from Tencent, after Sakana Chat's "My Fish", Generative Agents and
        Hy Memory's strength: age counts from the last recall, not from creation, so a
        memory the owner keeps relying on stays fresh; a memory recalled often weighs
        more, by 1 + ln(use count); and the memories returned have their use
        recorded, which the owner sees. Superseded memories are skipped.
        """
        live = self._live(shop_id, user_id)
        preferences = (
            select(
                AgentMemory.id,
                AgentMemory.content,
                AgentMemory.memory_type,
                AgentMemory.created_at,
                null().label("relevance"),
                AgentMemory.source_conversation_id,
            )
            .where(*live, AgentMemory.memory_type == "preference")
            .order_by(AgentMemory.importance.desc(), AgentMemory.created_at.desc())
            .limit(preference_limit)
        )
        with self.postgres.session() as session:
            rows = session.execute(preferences).all() if preference_limit else []
            rows += session.execute(
                self._searched(live, query, limit, [row.id for row in rows])
            ).all()
            if rows:
                session.execute(
                    update(AgentMemory)
                    .where(
                        AgentMemory.shop_id == shop_id,
                        AgentMemory.user_id == user_id,
                        AgentMemory.id.in_([row.id for row in rows]),
                    )
                    .values(
                        last_used_at=func.now(), use_count=AgentMemory.use_count + 1
                    )
                )
        return [
            RecalledMemory(
                row.id,
                row.content,
                row.memory_type,
                row.created_at,
                row.relevance,
                row.source_conversation_id,
            )
            for row in rows
        ]

    def _searched(
        self, live: tuple, query: list[float], limit: int, skipped: list[int]
    ) -> Select:
        """The `limit` live memories nearest `query` after decay, minus `skipped`."""
        distance = AgentMemory.embedding.cosine_distance(query)
        candidates = (
            select(
                AgentMemory.id,
                AgentMemory.content,
                AgentMemory.memory_type,
                AgentMemory.created_at,
                func.coalesce(AgentMemory.last_used_at, AgentMemory.created_at).label(
                    "touched_at"
                ),
                AgentMemory.importance,
                AgentMemory.use_count,
                (1 - distance).label("relevance"),
                AgentMemory.source_conversation_id,
            )
            .where(*live, AgentMemory.id.not_in(skipped))
            .order_by(distance)
            .limit(self.CANDIDATES)
            .subquery()
        )
        age_days = extract("epoch", func.now() - candidates.c.touched_at) / 86400
        # A memory never or once recalled keeps its weight, as in Hy Memory's strength.
        frequency = 1 + func.ln(func.greatest(candidates.c.use_count, 1))
        weight = (
            candidates.c.importance
            * func.exp(-self.DECAY_PER_DAY * age_days)
            * frequency
        )
        return (
            select(
                candidates.c.id,
                candidates.c.content,
                candidates.c.memory_type,
                candidates.c.created_at,
                candidates.c.relevance,
                candidates.c.source_conversation_id,
            )
            .order_by((candidates.c.relevance * weight).desc())
            .limit(limit)
        )

    @staticmethod
    def _live(shop_id: int, user_id: int) -> tuple:
        """Conditions of the owner's memories in force: not replaced, not expired."""
        return (
            AgentMemory.shop_id == shop_id,
            AgentMemory.user_id == user_id,
            AgentMemory.superseded_by.is_(None),
            or_(
                AgentMemory.expires_at.is_(None),
                AgentMemory.expires_at > func.now(),
            ),
        )

    def similar(
        self,
        shop_id: int,
        user_id: int,
        embeddings: list[list[float]],
        min_relevance: float,
        limit: int,
        skipped: list[int],
    ) -> list[StoredMemory]:
        """Live memories at least `min_relevance` close to any of `embeddings`.

        Up to `limit` per embedding, nearest first, minus `skipped`, each memory once.
        Unlike `search` this is no recall: it records no use.
        """
        found: dict[int, StoredMemory] = {}
        with self.postgres.session() as session:
            for embedding in embeddings:
                distance = AgentMemory.embedding.cosine_distance(embedding)
                rows = session.execute(
                    select(
                        AgentMemory.id,
                        AgentMemory.memory_type,
                        AgentMemory.content,
                        AgentMemory.importance,
                        AgentMemory.created_at,
                    )
                    .where(
                        *self._live(shop_id, user_id),
                        AgentMemory.id.not_in(skipped),
                        distance <= 1 - min_relevance,
                    )
                    .order_by(distance)
                    .limit(limit)
                ).all()
                for row in rows:
                    found.setdefault(
                        row.id,
                        StoredMemory(
                            row.id,
                            row.memory_type,
                            row.content,
                            row.importance,
                            row.created_at,
                        ),
                    )
        return list(found.values())

    def add(
        self,
        shop_id: int,
        user_id: int,
        conversation_id: int,
        memories: list[NewMemory],
    ) -> None:
        if not memories:
            return
        rows = [
            AgentMemory(
                shop_id=shop_id,
                user_id=user_id,
                source_conversation_id=conversation_id,
                memory_type=memory.memory_type,
                content=memory.content,
                embedding=memory.embedding,
                importance=memory.importance,
            )
            for memory in memories
        ]
        with self.postgres.session() as session:
            session.add_all(rows)
            session.flush()
            for memory, row in zip(memories, rows, strict=True):
                if memory.supersedes is None:
                    continue
                # Scoped like every statement, so a stray id cannot touch another
                # owner's memory.
                session.execute(
                    update(AgentMemory)
                    .where(
                        AgentMemory.id == memory.supersedes,
                        AgentMemory.shop_id == shop_id,
                        AgentMemory.user_id == user_id,
                        AgentMemory.superseded_by.is_(None),
                    )
                    .values(superseded_by=row.id)
                )

    def due_for_summary(
        self, shop_id: int, user_id: int, older_than_days: int
    ) -> list[MemoryGroup]:
        """Groups of two or more live memories older than `older_than_days`.

        Tencent summarizes old memories per day; grouping by conversation too lets a
        summary keep one source, so deleting that chat still forgets it.
        """
        day = func.date(func.timezone(SHOP_TIMEZONE.key, AgentMemory.created_at))
        group_size = func.count().over(
            partition_by=(AgentMemory.source_conversation_id, day)
        )
        rows = (
            select(
                AgentMemory.id,
                AgentMemory.source_conversation_id,
                AgentMemory.memory_type,
                AgentMemory.content,
                AgentMemory.importance,
                AgentMemory.created_at,
                day.label("day"),
                group_size.label("group_size"),
            )
            .where(
                *self._live(shop_id, user_id),
                AgentMemory.created_at < func.now() - timedelta(days=older_than_days),
                ~AgentMemory.details.has_key(self.SUMMARY_KEY),
            )
            .subquery()
        )
        statement = (
            select(rows)
            .where(rows.c.group_size >= 2)
            .order_by(rows.c.day, rows.c.source_conversation_id, rows.c.id)
        )
        with self.postgres.session() as session:
            found = session.execute(statement).all()
        return [
            MemoryGroup(
                conversation_id,
                group_day,
                [
                    StoredMemory(
                        row.id,
                        row.memory_type,
                        row.content,
                        row.importance,
                        row.created_at,
                    )
                    for row in group
                ],
            )
            for (group_day, conversation_id), group in groupby(
                found, key=lambda row: (row.day, row.source_conversation_id)
            )
        ]

    def replace(
        self,
        shop_id: int,
        user_id: int,
        group: MemoryGroup,
        summary: list[NewMemory],
    ) -> bool:
        """Swap a group for its summary in one transaction.

        The summary keeps the group's latest date, so the date shown to the model stays
        that of the facts, and carries its last recall and total use count. Memories
        the group had superseded now point at the summary, so they stay hidden.
        Returns False, changing nothing, when another run already replaced part of the
        group.
        """
        ids = [memory.id for memory in group.memories]
        try:
            with self.postgres.session() as session:
                rows = [
                    AgentMemory(
                        shop_id=shop_id,
                        user_id=user_id,
                        source_conversation_id=group.conversation_id,
                        memory_type=memory.memory_type,
                        content=memory.content,
                        embedding=memory.embedding,
                        importance=memory.importance,
                        details={self.SUMMARY_KEY: ids},
                        created_at=max(item.created_at for item in group.memories),
                    )
                    for memory in summary
                ]
                session.add_all(rows)
                session.flush()
                used = session.execute(
                    select(
                        func.max(AgentMemory.last_used_at),
                        func.coalesce(func.sum(AgentMemory.use_count), 0),
                    ).where(
                        AgentMemory.shop_id == shop_id,
                        AgentMemory.user_id == user_id,
                        AgentMemory.id.in_(ids),
                    )
                ).one()
                for row in rows:
                    row.last_used_at, row.use_count = used
                if rows:
                    session.execute(
                        update(AgentMemory)
                        .where(
                            AgentMemory.shop_id == shop_id,
                            AgentMemory.user_id == user_id,
                            AgentMemory.superseded_by.in_(ids),
                        )
                        .values(superseded_by=rows[0].id)
                    )
                deleted = session.execute(
                    delete(AgentMemory)
                    .where(
                        AgentMemory.shop_id == shop_id,
                        AgentMemory.user_id == user_id,
                        AgentMemory.id.in_(ids),
                    )
                    .returning(AgentMemory.id)
                ).all()
                if len(deleted) != len(ids):
                    # Raised inside the transaction, so the summary is rolled back.
                    raise LookupError("memory group changed")
        except LookupError:
            return False
        return True

    def list_live(self, shop_id: int, user_id: int) -> list[AgentMemory]:
        """The owner's memories in force, most recently used first, for their view."""
        with self.postgres.session() as session:
            return list(
                session.scalars(
                    # The view needs no embedding or metadata, the heavy columns.
                    select(AgentMemory)
                    .options(
                        load_only(
                            AgentMemory.id,
                            AgentMemory.memory_type,
                            AgentMemory.content,
                            AgentMemory.use_count,
                            AgentMemory.last_used_at,
                            AgentMemory.created_at,
                            AgentMemory.source_conversation_id,
                        )
                    )
                    .where(*self._live(shop_id, user_id))
                    .order_by(
                        AgentMemory.last_used_at.desc().nulls_last(),
                        AgentMemory.created_at.desc(),
                    )
                    .limit(self.LIST_LIMIT)
                )
            )

    def forget(self, shop_id: int, user_id: int, memory_id: int) -> bool:
        """Delete one memory with the older versions it replaced; False if not theirs.

        The older versions go too: superseded_by is ON DELETE SET NULL, so keeping them
        would bring the fact the owner just removed back to life.
        """
        owner = (AgentMemory.shop_id == shop_id, AgentMemory.user_id == user_id)
        with self.postgres.session() as session:
            ids = list(
                session.scalars(
                    select(AgentMemory.id).where(*owner, AgentMemory.id == memory_id)
                )
            )
            frontier = ids
            while frontier:
                frontier = list(
                    session.scalars(
                        select(AgentMemory.id).where(
                            *owner, AgentMemory.superseded_by.in_(frontier)
                        )
                    )
                )
                ids += frontier
            if ids:
                session.execute(delete(AgentMemory).where(AgentMemory.id.in_(ids)))
        return bool(ids)

    def memory_enabled(self, shop_id: int, user_id: int) -> bool:
        """The owner's switch; on until they turn it off."""
        with self.postgres.session() as session:
            enabled = session.scalar(
                select(AgentMemorySetting.memory_enabled).where(
                    AgentMemorySetting.shop_id == shop_id,
                    AgentMemorySetting.user_id == user_id,
                )
            )
        return True if enabled is None else enabled

    def set_memory_enabled(self, shop_id: int, user_id: int, enabled: bool) -> None:
        statement = insert(AgentMemorySetting).values(
            shop_id=shop_id, user_id=user_id, memory_enabled=enabled
        )
        with self.postgres.session() as session:
            session.execute(
                statement.on_conflict_do_update(
                    index_elements=["shop_id", "user_id"],
                    set_={"memory_enabled": enabled, "updated_at": func.now()},
                )
            )
