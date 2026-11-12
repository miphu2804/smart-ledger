"""Long-term memory flow: the owner's memory switch and remembered facts.

Mounted under `/internal/v1` by `main`, which also applies the internal-token check.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from src.memory.schema import (
    AgentMemoryItem,
    AgentMemorySettings,
    AgentMemorySettingsRequest,
)
from src.memory.service import AgentMemoryService

router = APIRouter(prefix="/agent/memory", tags=["agent"])


def get_memory(request: Request) -> AgentMemoryService | None:
    return request.app.state.memory


MemoryDep = Annotated[AgentMemoryService | None, Depends(get_memory)]


# The memory service is None while long-term memory is off, which the owner's app reads
# as "not available" rather than as an error.
@router.get("/settings", response_model=AgentMemorySettings)
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


@router.put("/settings", response_model=AgentMemorySettings)
async def put_memory_settings(payload: AgentMemorySettingsRequest, memory: MemoryDep):
    if memory is None:
        raise HTTPException(status_code=409, detail="memory_unavailable")
    await memory.set_memory_enabled(
        payload.shop_id, payload.user_id, payload.memory_enabled
    )
    return AgentMemorySettings(memory_enabled=payload.memory_enabled, available=True)


@router.get("/items", response_model=list[AgentMemoryItem])
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


@router.delete("/items/{memory_id}", status_code=204)
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
