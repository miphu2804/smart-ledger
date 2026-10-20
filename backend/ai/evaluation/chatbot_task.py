import uuid

from pydantic_ai.messages import ModelMessage, ModelResponse, ToolCallPart

from src.agent.service import AgentService
from src.agent.tools import AgentContext
from src.providers.factory import session_settings

# The eval has no real shop, so every case runs in one fixed scope.
EVAL_SCOPE = AgentContext(user_id=1, shop_id=1)


class ChatbotTask:
    """Runs one question through the production agent and returns the tools it called.

    The message carries the shop's current time, as a chat turn does, because the shop
    prompt tells the model every owner message ends with that line. Two parts of the
    turn are still not reproduced: production stops the run once a response both writes
    text and calls `suggest_screen`, and it bounds the run with the guardrail limits. A
    case that reaches a second model request therefore costs one more request here than
    the same turn would in production.

    The return value is only the case's output in the report. The metrics score the
    run's span tree instead, which holds the tool calls that actually executed, so a
    call the model made that never ran appears here and not in the metrics.
    """

    def __init__(self, service: AgentService) -> None:
        self._service = service

    async def __call__(self, question: str) -> list[str]:
        # OpenCode Go rejects a request without a session header, so each case gets its
        # own session, as a chat turn does.
        settings = session_settings(f"eval-{uuid.uuid4().hex}")
        result = await self._service.agent.run(
            self._service.with_current_time(question),
            deps=EVAL_SCOPE,
            model_settings=settings,
        )
        return sorted(self._tool_names(result.new_messages()))

    @staticmethod
    def _tool_names(messages: list[ModelMessage]) -> set[str]:
        return {
            part.tool_name
            for message in messages
            if isinstance(message, ModelResponse)
            for part in message.parts
            if isinstance(part, ToolCallPart)
        }
