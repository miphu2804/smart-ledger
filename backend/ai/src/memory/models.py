"""Memory records the repository returns and the memory service passes around."""

from dataclasses import dataclass
from datetime import date, datetime


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
