from datetime import datetime

from pydantic import BaseModel, Field


class AgentMemorySettingsRequest(BaseModel):
    user_id: int = Field(gt=0)
    shop_id: int = Field(gt=0)
    memory_enabled: bool


class AgentMemorySettings(BaseModel):
    memory_enabled: bool
    # False when long-term memory is off for the whole deployment.
    available: bool


class AgentMemoryItem(BaseModel):
    """One live memory in the owner's view of what the assistant remembers."""

    id: int
    memory_type: str
    content: str
    use_count: int
    last_used_at: datetime | None
    created_at: datetime
    source_conversation_id: int
