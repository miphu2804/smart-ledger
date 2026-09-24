from pydantic import BaseModel, Field


class AgentChatRequest(BaseModel):
    shop_id: str = Field(min_length=1)
    message: str = Field(min_length=1)


class AgentChatResponse(BaseModel):
    request_id: str
    answer: str
    model: str
    model_version: str
