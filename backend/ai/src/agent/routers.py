import uuid

from fastapi import APIRouter, HTTPException, Request

from src.agent.schemas import AgentChatRequest, AgentChatResponse
from src.agent.service import AgentService

router = APIRouter(
    prefix="/internal/v1/agent",
    tags=["agent"],
)


@router.post("/chat", response_model=AgentChatResponse)
def agent_chat(payload: AgentChatRequest, request: Request):
    agent: AgentService | None = getattr(request.app.state, "agent", None)
    if agent is None:
        raise HTTPException(status_code=503, detail="ai_unavailable")
    try:
        result = agent.chat(shop_id=payload.shop_id, message=payload.message)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="ai_unavailable") from exc
    return AgentChatResponse(
        request_id=str(uuid.uuid4()),
        answer=result.text,
        model=result.model,
        model_version=result.model_version,
    )
