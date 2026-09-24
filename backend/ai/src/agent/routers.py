import uuid
from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from src.agent.repository import ConversationNotFoundError
from src.agent.schemas import (
    AgentChatRequest,
    AgentChatResponse,
    AgentConversationRenameRequest,
    AgentConversationSummary,
    AgentConversationView,
)
from src.agent.service import AgentService

router = APIRouter(
    prefix="/internal/v1/agent",
    tags=["agent"],
)


def get_agent(request: Request) -> AgentService:
    agent: AgentService | None = getattr(request.app.state, "agent", None)
    if agent is None:
        raise HTTPException(status_code=503, detail="ai_unavailable")
    return agent


AgentServiceDep = Annotated[AgentService, Depends(get_agent)]


def raise_agent_http_error(exc: Exception) -> NoReturn:
    if isinstance(exc, ConversationNotFoundError):
        raise HTTPException(status_code=404, detail="conversation_not_found") from exc
    raise HTTPException(status_code=503, detail="ai_unavailable") from exc


@router.post("/chat", response_model=AgentChatResponse)
def agent_chat(
    payload: AgentChatRequest,
    agent: AgentServiceDep,
):
    try:
        result = agent.chat(
            user_id=payload.user_id,
            shop_id=payload.shop_id,
            conversation_id=payload.conversation_id,
            message=payload.message,
        )
    except Exception as exc:
        raise_agent_http_error(exc)
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
    agent: AgentServiceDep,
    user_id: int = Query(gt=0),
    shop_id: int = Query(gt=0),
):
    try:
        return agent.list_conversations(user_id=user_id, shop_id=shop_id)
    except Exception as exc:
        raise_agent_http_error(exc)


@router.get("/conversations/{conversation_id}", response_model=AgentConversationView)
def get_agent_conversation(
    conversation_id: int,
    agent: AgentServiceDep,
    user_id: int = Query(gt=0),
    shop_id: int = Query(gt=0),
):
    try:
        return agent.get_conversation(
            conversation_id=conversation_id,
            user_id=user_id,
            shop_id=shop_id,
        )
    except Exception as exc:
        raise_agent_http_error(exc)


@router.patch(
    "/conversations/{conversation_id}", response_model=AgentConversationSummary
)
def rename_agent_conversation(
    conversation_id: int,
    payload: AgentConversationRenameRequest,
    agent: AgentServiceDep,
):
    try:
        return agent.rename_conversation(
            conversation_id=conversation_id,
            user_id=payload.user_id,
            shop_id=payload.shop_id,
            title=payload.title,
        )
    except Exception as exc:
        raise_agent_http_error(exc)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_agent_conversation(
    conversation_id: int,
    agent: AgentServiceDep,
    user_id: int = Query(gt=0),
    shop_id: int = Query(gt=0),
) -> Response:
    try:
        agent.delete_conversation(
            conversation_id=conversation_id,
            user_id=user_id,
            shop_id=shop_id,
        )
    except Exception as exc:
        raise_agent_http_error(exc)
    return Response(status_code=204)
