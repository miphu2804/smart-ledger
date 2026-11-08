"""Per-execution context copied into the stream producer and database worker thread."""

from contextvars import ContextVar
from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from src.agent.receipts import AgentTurnRepository


@dataclass(frozen=True)
class TurnExecution:
    store: "AgentTurnRepository"
    turn_id: UUID
    user_id: int
    shop_id: int
    fence: int
    fingerprint: str


current_turn: ContextVar[TurnExecution | None] = ContextVar("agent_turn", default=None)
