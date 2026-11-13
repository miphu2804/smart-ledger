from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, model_validator

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
    turn_id: UUID | None = None
    execution_fence: int | None = Field(
        default=None, gt=0, le=9223372036854775807, strict=True
    )

    @model_validator(mode="after")
    def paired_execution(self):
        if (self.turn_id is None) != (self.execution_fence is None):
            raise ValueError("turn_id and execution_fence must be supplied together")
        return self


class AgentChatResponse(BaseModel):
    conversation_id: int
    message_id: int
    request_id: str
    answer: str
    model: str
    model_version: str


class AgentTurnCancelRequest(BaseModel):
    model_config = {"extra": "forbid"}
    user_id: int = Field(gt=0)
    shop_id: int = Field(gt=0)
    execution_fence: int = Field(gt=0, le=9223372036854775807, strict=True)


class AgentTurnReceipt(BaseModel):
    turn_id: UUID
    execution_fence: int
    state: Literal["IN_PROGRESS", "SUCCEEDED", "FAILED", "CANCELLED"]
    resultAvailable: bool
    result: AgentChatResponse | None
    failure_code: str | None


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
