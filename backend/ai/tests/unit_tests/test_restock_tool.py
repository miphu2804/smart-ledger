import json
from types import SimpleNamespace

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage
from langchain_core.utils.function_calling import convert_to_openai_tool
from tests.support import TEST_GUARDRAIL_LIMITS

from src.agent.service import AgentService
from src.agent.tools import AgentContext, build_restock_tools
from src.prompt_templates import (
    RESTOCK_PROMPT,
    RESTOCK_RESULT_HEADER,
    SHOP_AGENT_SYSTEM_PROMPT,
    SQL_AGENT_PROMPT,
)
from src.restock.service import RestockService

SUGGESTION_FIELDS = {
    "product_id",
    "product_name",
    "unit",
    "suggested_qty",
    "period",
    "reason",
}


class ToolCallingChatModel(FakeMessagesListChatModel):
    seen_calls: list = []
    bound_tools: list = []

    def bind_tools(self, tools, **kwargs):
        self.bound_tools = [convert_to_openai_tool(t) for t in tools]
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen_calls = [*self.seen_calls, list(messages)]
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


class FakeExecutor:
    """Records the calls and replays one configured result, like the real executor's."""

    def __init__(self, rows: list | None = None, truncated: bool = False, error=None):
        self.rows = rows or []
        self.truncated = truncated
        self.error = error
        self.calls: list[tuple[int, str]] = []

    def run(self, shop_id: int, sql: str) -> dict:
        self.calls.append((shop_id, sql))
        if self.error is not None:
            raise self.error
        return {
            "columns": ["id", "name", "unit", "sold_qty", "stock_quantity"],
            "rows": self.rows,
            "truncated": self.truncated,
        }


class FakeConversationRepository:
    def __init__(self) -> None:
        self.saved_exchange: dict | None = None

    def recent_messages(self, conversation_id, user_id, shop_id, limit):
        return []

    def save_exchange(self, **kwargs):
        self.saved_exchange = kwargs
        return kwargs["conversation_id"] or 41, 72


def row(
    product_id: int = 1,
    name: str = "Gạo",
    unit: str = "kg",
    sold_qty="7",
    stock_qty="0",
) -> list:
    return [product_id, name, unit, sold_qty, stock_qty]


def tool_call(args: dict, call_id: str = "call-1") -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[{"name": "suggest_restock", "args": args, "id": call_id}],
    )


def suggest_then_answer(args: dict, answer: str = "done") -> ToolCallingChatModel:
    return ToolCallingChatModel(responses=[tool_call(args), AIMessage(content=answer)])


def build_agent(
    model,
    executor: FakeExecutor | None = None,
    restock: RestockService | None = None,
) -> AgentService:
    return AgentService(
        model,
        FakeConversationRepository(),
        sql_executor=executor,
        restock=restock,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )


def tool_messages(model: ToolCallingChatModel) -> list:
    return [message for message in model.seen_calls[-1] if message.type == "tool"]


def test_model_facing_schema_has_only_period() -> None:
    (suggest_tool,) = build_restock_tools(RestockService(FakeExecutor()))

    assert suggest_tool.name == "suggest_restock"
    schema = suggest_tool.tool_call_schema.model_json_schema()
    assert list(schema["properties"]) == ["period"]
    assert schema["properties"]["period"]["enum"] == ["last_7_days", "last_30_days"]
    assert len(suggest_tool.description) < 200


def test_tools_sent_to_the_model_expose_only_period() -> None:
    model = suggest_then_answer({"period": "last_7_days"})
    build_agent(model, restock=RestockService(FakeExecutor(rows=[row()]))).chat(
        user_id=3, shop_id=15, message="m"
    )

    specs = [t for t in model.bound_tools if t["function"]["name"] == "suggest_restock"]
    parameters = specs[0]["function"]["parameters"]
    assert list(parameters["properties"]) == ["period"]
    assert parameters["required"] == ["period"]


def test_tool_runs_with_the_context_shop_and_period() -> None:
    executor = FakeExecutor(rows=[row()])
    model = suggest_then_answer({"period": "last_30_days"})
    build_agent(model, restock=RestockService(executor)).chat(
        user_id=3, shop_id=15, message="nên nhập gì?"
    )

    (shop_id, sql) = executor.calls[0]
    assert shop_id == 15
    assert "interval '30 days'" in sql


def test_model_cannot_change_the_shop_through_tool_arguments() -> None:
    executor = FakeExecutor(rows=[row()])
    model = suggest_then_answer(
        {"period": "last_7_days", "shop_id": 99, "runtime": {"x": 1}}
    )
    build_agent(model, restock=RestockService(executor)).chat(
        user_id=3, shop_id=15, message="gợi ý cho tiệm 99?"
    )

    assert [shop_id for shop_id, _ in executor.calls] == [15]


def test_result_json_lists_every_suggestion_field() -> None:
    executor = FakeExecutor(rows=[row(sold_qty="14.5", stock_qty="0")], truncated=True)
    (suggest_tool,) = build_restock_tools(RestockService(executor))

    text = suggest_tool.func(
        "last_7_days",
        SimpleNamespace(context=AgentContext(user_id=3, shop_id=15)),
    )

    header, payload = text.split("\n", 1)
    assert header == RESTOCK_RESULT_HEADER
    body = json.loads(payload)
    assert (body["period"], body["days"], body["truncated"]) == (
        "last_7_days",
        7,
        True,
    )
    (suggestion,) = body["suggestions"]
    assert set(suggestion) == SUGGESTION_FIELDS
    assert suggestion["unit"] == "kg"
    assert suggestion["suggested_qty"] == 15
    assert suggestion["reason"] == "Bán 14,5 kg trong 7 ngày qua, còn 0 kg"


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (
            ValueError("SQL_ERROR: relation v_sale_items does not exist"),
            "Error[SQL_ERROR]: relation v_sale_items does not exist.",
        ),
        (
            ValueError("QUERY_TIMEOUT: query exceeded 3000 ms; simplify it"),
            "Error[QUERY_TIMEOUT]: query exceeded 3000 ms; simplify it.",
        ),
    ],
)
def test_query_errors_go_back_to_the_model_and_the_turn_answers(
    error: Exception, expected: str
) -> None:
    conversations = FakeConversationRepository()
    model = suggest_then_answer({"period": "last_7_days"}, answer="Chưa tính được.")
    agent = AgentService(
        model,
        conversations,
        restock=RestockService(FakeExecutor(error=error)),
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    result = agent.chat(user_id=3, shop_id=15, message="m")

    assert result.answer == "Chưa tính được."
    (message,) = tool_messages(model)
    assert message.content == (
        f"{expected} Tell the owner the suggestion is unavailable."
    )
    assert conversations.saved_exchange["assistant_message"] == "Chưa tính được."


@pytest.mark.parametrize(
    "error",
    [
        RuntimeError("sql reader unavailable"),
        ValueError("shop_id must be a positive integer"),
    ],
)
def test_infrastructure_errors_fail_the_turn(error: Exception) -> None:
    conversations = FakeConversationRepository()
    model = suggest_then_answer({"period": "last_7_days"})
    agent = AgentService(
        model,
        conversations,
        restock=RestockService(FakeExecutor(error=error)),
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    with pytest.raises(type(error)):
        agent.chat(user_id=3, shop_id=15, message="m")

    assert conversations.saved_exchange is None


def test_agent_without_restock_has_no_suggest_restock_tool() -> None:
    model = ToolCallingChatModel(responses=[AIMessage(content="ok")])
    build_agent(model, executor=FakeExecutor()).chat(user_id=3, shop_id=15, message="m")

    names = [t["function"]["name"] for t in model.bound_tools]
    assert "query_shop_data" in names
    assert "suggest_restock" not in names


def test_system_prompt_is_static_and_carries_the_restock_rules() -> None:
    executor = FakeExecutor(rows=[row()])
    model = suggest_then_answer({"period": "last_7_days"})
    build_agent(model, executor=executor, restock=RestockService(executor)).chat(
        user_id=3, shop_id=15, message="m"
    )

    system = model.seen_calls[0][0]
    assert system.type == "system"
    assert system.content == (
        f"{SHOP_AGENT_SYSTEM_PROMPT}\n\n{SQL_AGENT_PROMPT}\n\n{RESTOCK_PROMPT}"
    )
    assert "15" not in system.content


def test_restock_prompt_keeps_the_tool_values() -> None:
    assert "suggested_qty, unit and reason exactly" in RESTOCK_PROMPT
