"""Agent flow: chat turns and the owner's conversation history.

Mounted under `/internal/v1` by `main`, which also applies the internal-token check
and maps errors to the contract's status codes.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from src.agent.repository import AgentConversationRepository
from src.agent.schema import (
    AgentChatRequest,
    AgentChatResponse,
    AgentConversationRenameRequest,
    AgentConversationSummary,
    AgentConversationView,
)
from src.agent.service import AgentService

router = APIRouter(prefix="/agent", tags=["agent"])


def get_agent(request: Request) -> AgentService:
    return request.app.state.agent


def get_conversations(request: Request) -> AgentConversationRepository:
    return request.app.state.conversations


AgentServiceDep = Annotated[AgentService, Depends(get_agent)]
ConversationsDep = Annotated[AgentConversationRepository, Depends(get_conversations)]


# Async: the model call awaits on the event loop and the service moves its blocking
# database calls to worker threads. The conversation routes below only touch the
# database, so they stay sync and FastAPI runs them in its thread pool.
@router.post("/chat", response_model=AgentChatResponse)
async def agent_chat(payload: AgentChatRequest, agent: AgentServiceDep):
    result = await agent.chat(
        user_id=payload.user_id,
        shop_id=payload.shop_id,
        conversation_id=payload.conversation_id,
        message=payload.message,
    )
    return AgentChatResponse(
        conversation_id=result.conversation_id,
        message_id=result.message_id,
        request_id=str(uuid.uuid4()),
        answer=result.answer,
        model=result.model,
        model_version=result.model_version,
    )


@router.get("/conversations", response_model=list[AgentConversationSummary])
def list_agent_conversations(
    conversations: ConversationsDep,
    user_id: int = Query(gt=0),
    shop_id: int = Query(gt=0),
):
    return conversations.list_conversations(user_id=user_id, shop_id=shop_id)


@router.get("/conversations/{conversation_id}", response_model=AgentConversationView)
def get_agent_conversation(
    conversation_id: int,
    conversations: ConversationsDep,
    user_id: int = Query(gt=0),
    shop_id: int = Query(gt=0),
):
    return conversations.get_conversation(
        conversation_id=conversation_id,
        user_id=user_id,
        shop_id=shop_id,
    )


@router.patch(
    "/conversations/{conversation_id}", response_model=AgentConversationSummary
)
def rename_agent_conversation(
    conversation_id: int,
    payload: AgentConversationRenameRequest,
    conversations: ConversationsDep,
):
    return conversations.rename_conversation(
        conversation_id=conversation_id,
        user_id=payload.user_id,
        shop_id=payload.shop_id,
        title=payload.title,
    )


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_agent_conversation(
    conversation_id: int,
    conversations: ConversationsDep,
    user_id: int = Query(gt=0),
    shop_id: int = Query(gt=0),
) -> Response:
    conversations.delete_conversation(
        conversation_id=conversation_id,
        user_id=user_id,
        shop_id=shop_id,
    )
    return Response(status_code=204)
