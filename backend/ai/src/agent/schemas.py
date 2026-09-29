from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

ChatText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
ConversationTitle = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]


class AgentChatRequest(BaseModel):
    user_id: int = Field(gt=0)
    shop_id: int = Field(gt=0)
    conversation_id: int | None = Field(default=None, gt=0)
    message: ChatText


class AgentChatResponse(BaseModel):
    conversation_id: int
    message_id: int
    request_id: str
    answer: str
    model: str
    model_version: str


class AgentConversationRenameRequest(BaseModel):
    user_id: int = Field(gt=0)
    shop_id: int = Field(gt=0)
    title: ConversationTitle


class AgentConversationSummary(BaseModel):
    conversation_id: int
    title: str | None
    last_message_at: datetime


class AgentConversationMessage(BaseModel):
    message_id: int
    role: Literal["USER", "ASSISTANT"]
    content: str
    created_at: datetime


class AgentConversationView(AgentConversationSummary):
    messages: list[AgentConversationMessage]
