"""Agent flow: chat turns and the owner's conversation history.

Mounted under `/internal/v1` by `main`, which also applies the internal-token check
and maps errors to the contract's status codes.
"""

import json
import logging
import uuid
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.sse import EventSourceResponse, format_sse_event

from src.agent.errors import ConversationNotFoundError, GuardrailError
from src.agent.repository import AgentConversationRepository
from src.agent.schema import (
    AgentChatRequest,
    AgentChatResponse,
    AgentConversationRenameRequest,
    AgentConversationSummary,
    AgentConversationView,
    AgentMemoryItem,
    AgentMemorySettings,
    AgentMemorySettingsRequest,
)
from src.agent.service import (
    AgentChatResult,
    AgentService,
    AgentStreamEvent,
    MemoryRecalled,
    Reset,
    TextDelta,
)
from src.agent.tool_events import ToolFinished, ToolStarted
from src.memory.service import AgentMemoryService

router = APIRouter(prefix="/agent", tags=["agent"])
logger = logging.getLogger(__name__)


def get_agent(request: Request) -> AgentService:
    return request.app.state.agent


def get_memory(request: Request) -> AgentMemoryService | None:
    return request.app.state.memory


def get_conversations(request: Request) -> AgentConversationRepository:
    return request.app.state.conversations


AgentServiceDep = Annotated[AgentService, Depends(get_agent)]
ConversationsDep = Annotated[AgentConversationRepository, Depends(get_conversations)]
MemoryDep = Annotated[AgentMemoryService | None, Depends(get_memory)]


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
    if isinstance(event, ToolStarted):
        return format_sse_event(
            event="tool_start",
            data_str=json.dumps({"call_id": event.call_id, "name": event.name}),
        )
    if isinstance(event, ToolFinished):
        return format_sse_event(
            event="tool_end", data_str=json.dumps({"call_id": event.call_id})
        )
    if isinstance(event, MemoryRecalled):
        used = [
            {
                "id": memory.id,
                "memory_type": memory.memory_type,
                "content": memory.content,
                "source_conversation_id": memory.source_conversation_id,
                "created_at": memory.created_at.isoformat(),
            }
            for memory in event.memories
        ]
        return format_sse_event(event="memory", data_str=json.dumps({"used": used}))
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


# The memory service is None while long-term memory is off, which the owner's app reads
# as "not available" rather than as an error.
@router.get("/memory/settings", response_model=AgentMemorySettings)
async def get_memory_settings(
    memory: MemoryDep,
    user_id: int = Query(gt=0),
    shop_id: int = Query(gt=0),
):
    if memory is None:
        return AgentMemorySettings(memory_enabled=False, available=False)
    return AgentMemorySettings(
        memory_enabled=await memory.memory_enabled(shop_id, user_id), available=True
    )


@router.put("/memory/settings", response_model=AgentMemorySettings)
async def put_memory_settings(payload: AgentMemorySettingsRequest, memory: MemoryDep):
    if memory is None:
        raise HTTPException(status_code=409, detail="memory_unavailable")
    await memory.set_memory_enabled(
        payload.shop_id, payload.user_id, payload.memory_enabled
    )
    return AgentMemorySettings(memory_enabled=payload.memory_enabled, available=True)


@router.get("/memory/items", response_model=list[AgentMemoryItem])
async def list_memories(
    memory: MemoryDep,
    user_id: int = Query(gt=0),
    shop_id: int = Query(gt=0),
):
    if memory is None:
        return []
    return [
        AgentMemoryItem.model_validate(item, from_attributes=True)
        for item in await memory.list_memories(shop_id, user_id)
    ]


@router.delete("/memory/items/{memory_id}", status_code=204)
async def delete_memory(
    memory_id: int,
    memory: MemoryDep,
    user_id: int = Query(gt=0),
    shop_id: int = Query(gt=0),
) -> Response:
    if memory is None:
        raise HTTPException(status_code=409, detail="memory_unavailable")
    if not await memory.forget(shop_id, user_id, memory_id):
        raise HTTPException(status_code=404, detail="memory_not_found")
    return Response(status_code=204)
