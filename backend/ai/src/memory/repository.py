from dataclasses import dataclass
from datetime import date, datetime, timedelta
from itertools import groupby

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    String,
    Text,
    delete,
    extract,
    func,
    or_,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.postgre_db_client import Base, PostgreDBClient
from src.utils import SHOP_TIMEZONE


class AgentMemory(Base):
    __tablename__ = "agent_memories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    shop_id: Mapped[int] = mapped_column(BigInteger)
    user_id: Mapped[int] = mapped_column(BigInteger)
    source_conversation_id: Mapped[int] = mapped_column(BigInteger)
    memory_type: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    # Dimension of the default multilingual MiniLM model; the migration fixes it.
    embedding: Mapped[list[float]] = mapped_column(Vector(384))
    importance: Mapped[float] = mapped_column(Float)
    # `metadata` is reserved on declarative classes, hence the attribute name.
    details: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


@dataclass(frozen=True)
class NewMemory:
    memory_type: str
    content: str
    importance: float
    embedding: list[float]


@dataclass(frozen=True)
class RecalledMemory:
    content: str
    memory_type: str
    created_at: datetime
    relevance: float


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

    def __init__(self, postgres: PostgreDBClient) -> None:
        self.postgres = postgres

    def search(
        self, shop_id: int, user_id: int, query: list[float], limit: int
    ) -> list[RecalledMemory]:
        """Tencent's semantic search, re-ranked by Tencent's decay.

        "Agent Long-Term Memory", Feature Overview: skip expired rows, take the nearest
        by cosine distance with relevance as 1 - distance, and weigh each memory by
        importance * exp(-0.01 * age in days). Tencent shows the two as separate
        queries; here the decay weight multiplies the relevance of the cosine
        candidates, so an old or minor memory yields to a fresh, important one about
        the same thing. The shop and user replace Tencent's agent_id filter, and both
        come from the request.
        """
        distance = AgentMemory.embedding.cosine_distance(query)
        candidates = (
            select(
                AgentMemory.content,
                AgentMemory.memory_type,
                AgentMemory.created_at,
                AgentMemory.importance,
                (1 - distance).label("relevance"),
            )
            .where(
                AgentMemory.shop_id == shop_id,
                AgentMemory.user_id == user_id,
                or_(
                    AgentMemory.expires_at.is_(None),
                    AgentMemory.expires_at > func.now(),
                ),
            )
            .order_by(distance)
            .limit(self.CANDIDATES)
            .subquery()
        )
        age_days = extract("epoch", func.now() - candidates.c.created_at) / 86400
        weight = candidates.c.importance * func.exp(-self.DECAY_PER_DAY * age_days)
        statement = (
            select(
                candidates.c.content,
                candidates.c.memory_type,
                candidates.c.created_at,
                candidates.c.relevance,
            )
            .order_by((candidates.c.relevance * weight).desc())
            .limit(limit)
        )
        with self.postgres.session() as session:
            rows = session.execute(statement).all()
        return [
            RecalledMemory(row.content, row.memory_type, row.created_at, row.relevance)
            for row in rows
        ]

    def add(
        self,
        shop_id: int,
        user_id: int,
        conversation_id: int,
        memories: list[NewMemory],
    ) -> None:
        if not memories:
            return
        with self.postgres.session() as session:
            session.add_all(
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
                AgentMemory.shop_id == shop_id,
                AgentMemory.user_id == user_id,
                AgentMemory.created_at < func.now() - timedelta(days=older_than_days),
                or_(
                    AgentMemory.expires_at.is_(None),
                    AgentMemory.expires_at > func.now(),
                ),
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

        The summary keeps the group's latest date, so decay and the date shown to the
        model stay those of the facts. Returns False, changing nothing, when another
        run already replaced part of the group.
        """
        ids = [memory.id for memory in group.memories]
        try:
            with self.postgres.session() as session:
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
                    # Raised inside the transaction, so the delete is rolled back.
                    raise LookupError("memory group changed")
                session.add_all(
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
                )
        except LookupError:
            return False
        return True
