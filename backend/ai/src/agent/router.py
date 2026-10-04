import logging
import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Query,
    Request,
    Response,
)
from fastapi.responses import JSONResponse

from src.agent.repository import (
    AgentConversationRepository,
    ConversationNotFoundError,
)
from src.agent.schema import (
    AgentChatRequest,
    AgentChatResponse,
    AgentConversationRenameRequest,
    AgentConversationSummary,
    AgentConversationView,
)
from src.agent.service import AgentService
from src.security import require_internal_token

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/internal/v1/agent",
    tags=["agent"],
    dependencies=[Depends(require_internal_token)],
)


def get_agent(request: Request) -> AgentService:
    return request.app.state.agent


def get_conversations(request: Request) -> AgentConversationRepository:
    return request.app.state.conversations


AgentServiceDep = Annotated[AgentService, Depends(get_agent)]
ConversationsDep = Annotated[AgentConversationRepository, Depends(get_conversations)]


@router.post("/chat", response_model=AgentChatResponse)
def agent_chat(
    payload: AgentChatRequest,
    agent: AgentServiceDep,
):
    result = agent.chat(
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


def conversation_not_found_handler(
    request: Request, exc: ConversationNotFoundError
) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "conversation_not_found"})


def agent_failure_handler(request: Request, exc: Exception) -> JSONResponse:
    # The client only sees ai_unavailable, so the cause has to reach the server log.
    logger.warning("agent request failed", exc_info=exc)
    return JSONResponse(status_code=503, content={"detail": "ai_unavailable"})
