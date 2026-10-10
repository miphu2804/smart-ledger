"""Agent flow: chat turns and the owner's conversation history.

Mounted under `/internal/v1` by `main`, which also applies the internal-token check
and maps errors to the contract's status codes.
"""

import json
import logging
import uuid
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.sse import EventSourceResponse, format_sse_event

from src.agent.guardrails import GuardrailError
from src.agent.repository import AgentConversationRepository, ConversationNotFoundError
from src.agent.schema import (
    AgentChatRequest,
    AgentChatResponse,
    AgentConversationRenameRequest,
    AgentConversationSummary,
    AgentConversationView,
)
from src.agent.service import (
    AgentChatResult,
    AgentService,
    AgentStreamEvent,
    Reset,
    TextDelta,
)

router = APIRouter(prefix="/agent", tags=["agent"])
logger = logging.getLogger(__name__)


def get_agent(request: Request) -> AgentService:
    return request.app.state.agent


def get_conversations(request: Request) -> AgentConversationRepository:
    return request.app.state.conversations


AgentServiceDep = Annotated[AgentService, Depends(get_agent)]
ConversationsDep = Annotated[AgentConversationRepository, Depends(get_conversations)]


def _chat_response(result: AgentChatResult) -> AgentChatResponse:
    return AgentChatResponse(
        conversation_id=result.conversation_id,
        message_id=result.message_id,
        request_id=str(uuid.uuid4()),
        answer=result.answer,
        model=result.model,
        model_version=result.model_version,
    )


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
    return _chat_response(result)


# Awaited before the response starts, so a missing conversation, an overlong message
# or a missing model still reach main's handlers as 404, 422 and 503. Once the stream
# has started, a failure is sent as an `error` event instead.
# No `response_class`: FastAPI would treat this endpoint as a generator, so the media
# type is documented through `responses`.
@router.post(
    "/chat/stream",
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def agent_chat_stream(payload: AgentChatRequest, agent: AgentServiceDep):
    events = await agent.stream_chat(
        user_id=payload.user_id,
        shop_id=payload.shop_id,
        conversation_id=payload.conversation_id,
        message=payload.message,
    )
    return EventSourceResponse(_sse_events(events))


async def _sse_events(
    events: AsyncGenerator[AgentStreamEvent],
) -> AsyncIterator[bytes]:
    try:
        async for event in events:
            yield _sse_frame(event)
    except Exception as error:
        code = _stream_error_code(error)
        yield format_sse_event(event="error", data_str=json.dumps({"detail": code}))
    finally:
        # Closing the iterator cancels the turn's run now, not when it is collected.
        await events.aclose()


def _sse_frame(event: AgentStreamEvent) -> bytes:
    if isinstance(event, TextDelta):
        return format_sse_event(
            event="delta", data_str=json.dumps({"text": event.text})
        )
    if isinstance(event, Reset):
        return format_sse_event(event="reset", data_str="{}")
    return format_sse_event(
        event="done", data_str=_chat_response(event.result).model_dump_json()
    )


def _stream_error_code(error: Exception) -> str:
    if isinstance(error, GuardrailError):
        return error.code
    if isinstance(error, ConversationNotFoundError):
        return "conversation_not_found"
    # The caller only sees the code, so the cause has to reach the server log.
    logger.warning("agent stream failed", exc_info=error)
    return "ai_unavailable"


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
