"""Agent flow: chat turns and the owner's conversation history.

Mounted under `/internal/v1` by `main`, which also applies the internal-token check
and maps errors to the contract's status codes.
"""

import json
import logging
import uuid
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse
from fastapi.sse import EventSourceResponse, format_sse_event

from src.agent.errors import SAFE_ERRORS, TurnProtocolError, failure_code
from src.agent.repository import AgentConversationRepository
from src.agent.schema import (
    AgentChatRequest,
    AgentChatResponse,
    AgentConversationRenameRequest,
    AgentConversationSummary,
    AgentConversationView,
    AgentTurnCancelRequest,
    AgentTurnReceipt,
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
from src.agent.turns import AgentTurnService

router = APIRouter(prefix="/agent", tags=["agent"])
logger = logging.getLogger(__name__)


def get_agent(request: Request) -> AgentService:
    return request.app.state.agent


def get_conversations(request: Request) -> AgentConversationRepository:
    return request.app.state.conversations


AgentServiceDep = Annotated[AgentService, Depends(get_agent)]
ConversationsDep = Annotated[AgentConversationRepository, Depends(get_conversations)]


def get_turns(request: Request) -> AgentTurnService | None:
    return getattr(request.app.state, "turns", None)


TurnsDep = Annotated[AgentTurnService | None, Depends(get_turns)]


def _require_turns(turns):
    if turns is None:
        raise TurnProtocolError("ai_turn_unavailable", 503)
    # The service gates itself: `admit`, `read` and `cancel` check the flag first.
    return turns


def _chat_response(
    result: AgentChatResult, request_id: str | None = None
) -> AgentChatResponse:
    return AgentChatResponse(
        conversation_id=result.conversation_id,
        message_id=result.message_id,
        request_id=request_id or str(uuid.uuid4()),
        answer=result.answer,
        model=result.model,
        model_version=result.model_version,
    )


# Async: the model call awaits on the event loop and the service moves its blocking
# database calls to worker threads. The conversation routes below only touch the
# database, so they stay sync and FastAPI runs them in its thread pool.
@router.post(
    "/chat",
    response_model=AgentChatResponse,
    responses={202: {"model": AgentTurnReceipt}},
)
async def agent_chat(
    payload: AgentChatRequest, agent: AgentServiceDep, turns: TurnsDep
):
    if payload.turn_id is not None:
        result = await _require_turns(turns).chat_turn(payload)
        if result is None:
            return _pending(payload)
        return JSONResponse(
            content=_chat_response(result, str(payload.turn_id)).model_dump(),
            headers={"Cache-Control": "no-store"},
        )
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
    responses={
        200: {"content": {"text/event-stream": {}}},
        202: {"model": AgentTurnReceipt},
    },
)
async def agent_chat_stream(
    payload: AgentChatRequest, agent: AgentServiceDep, turns: TurnsDep
):
    if payload.turn_id is not None:
        events = await _require_turns(turns).stream_turn(payload)
        if events is None:
            return _pending(payload)
        return EventSourceResponse(
            _sse_events(events, str(payload.turn_id)),
            headers={"Cache-Control": "no-store"},
        )
    events = await agent.stream_chat(
        user_id=payload.user_id,
        shop_id=payload.shop_id,
        conversation_id=payload.conversation_id,
        message=payload.message,
    )
    return EventSourceResponse(_sse_events(events))


async def _sse_events(
    events: AsyncGenerator[AgentStreamEvent],
    request_id: str | None = None,
) -> AsyncIterator[bytes]:
    try:
        async for event in events:
            yield _sse_frame(event, request_id)
    except Exception as error:
        code = _stream_error_code(error)
        yield format_sse_event(event="error", data_str=json.dumps({"detail": code}))
    finally:
        # Closing the iterator cancels the turn's run now, not when it is collected.
        await events.aclose()


def _sse_frame(event: AgentStreamEvent, request_id: str | None = None) -> bytes:
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
        event="done",
        data_str=_chat_response(event.result, request_id).model_dump_json(),
    )


def _stream_error_code(error: Exception) -> str:
    if not isinstance(error, SAFE_ERRORS):
        # The caller only sees the code, so the cause has to reach the server log.
        logger.warning("agent stream failed", exc_info=error)
    return failure_code(error)


def _pending(payload):
    return JSONResponse(
        status_code=202,
        content={
            "turn_id": str(payload.turn_id),
            "execution_fence": payload.execution_fence,
            "state": "IN_PROGRESS",
            "resultAvailable": False,
            "result": None,
            "failure_code": None,
        },
        headers={"Retry-After": "2", "Cache-Control": "no-store"},
    )


@router.get("/turns/{turn_id}", response_model=AgentTurnReceipt)
async def get_agent_turn(
    turn_id: UUID,
    turns: TurnsDep,
    response: Response,
    user_id: int = Query(gt=0),
    shop_id: int = Query(gt=0),
):
    response.headers["Cache-Control"] = "no-store"
    return await _require_turns(turns).read(turn_id, user_id, shop_id)


@router.post("/turns/{turn_id}/cancel", response_model=AgentTurnReceipt)
async def cancel_agent_turn(
    turn_id: UUID, payload: AgentTurnCancelRequest, turns: TurnsDep, response: Response
):
    response.headers["Cache-Control"] = "no-store"
    return await _require_turns(turns).cancel(
        turn_id, payload.user_id, payload.shop_id, payload.execution_fence
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
