import json
from types import SimpleNamespace

import pytest
from tests.support import (
    TEST_GUARDRAIL_LIMITS,
    ScriptedModel,
    tool_call,
    tool_results,
)

from src.agent.service import AgentService
from src.agent.tools import AgentContext, build_restock_tool
from src.prompt_templates import (
    RESTOCK_PROMPT,
    RESTOCK_RESULT_HEADER,
    SHOP_AGENT_SYSTEM_PROMPT,
    SQL_AGENT_PROMPT,
)
from src.restock.service import RestockService

pytestmark = pytest.mark.anyio

SUGGESTION_FIELDS = {
    "product_id",
    "product_name",
    "unit",
    "suggested_qty",
    "period",
    "reason",
}


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


def suggest_then_answer(args: dict, answer: str = "done") -> ScriptedModel:
    return ScriptedModel(tool_call("suggest_restock", args), answer)


def build_agent(
    model,
    executor: FakeExecutor | None = None,
    restock: RestockService | None = None,
    conversations: FakeConversationRepository | None = None,
) -> AgentService:
    return AgentService(
        model,
        conversations or FakeConversationRepository(),
        sql_executor=executor,
        restock=restock,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )


def test_model_facing_schema_has_only_period() -> None:
    tool = build_restock_tool(RestockService(FakeExecutor()))

    assert tool.name == "suggest_restock"
    schema = tool.tool_def.parameters_json_schema
    assert list(schema["properties"]) == ["period"]
    assert schema["properties"]["period"]["enum"] == ["last_7_days", "last_30_days"]
    assert len(tool.description) < 200


async def test_tools_sent_to_the_model_expose_only_period() -> None:
    model = suggest_then_answer({"period": "last_7_days"})

    await build_agent(model, restock=RestockService(FakeExecutor(rows=[row()]))).chat(
        user_id=3, shop_id=15, message="m"
    )

    (spec,) = model.requests[0][1].function_tools
    assert spec.name == "suggest_restock"
    assert list(spec.parameters_json_schema["properties"]) == ["period"]
    assert spec.parameters_json_schema["required"] == ["period"]


async def test_tool_runs_with_the_context_shop_and_period() -> None:
    executor = FakeExecutor(rows=[row()])
    model = suggest_then_answer({"period": "last_30_days"})

    await build_agent(model, restock=RestockService(executor)).chat(
        user_id=3, shop_id=15, message="nên nhập gì?"
    )

    (shop_id, sql) = executor.calls[0]
    assert shop_id == 15
    assert "interval '30 days'" in sql


async def test_model_cannot_change_the_shop_through_tool_arguments() -> None:
    executor = FakeExecutor(rows=[row()])
    model = ScriptedModel(
        tool_call(
            "suggest_restock",
            {"period": "last_7_days", "shop_id": 99, "runtime": {"x": 1}},
        ),
        tool_call("suggest_restock", {"period": "last_7_days"}),
        "done",
    )

    await build_agent(model, restock=RestockService(executor)).chat(
        user_id=3, shop_id=15, message="gợi ý cho tiệm 99?"
    )

    # The call with extra arguments is sent back for a retry and never runs.
    assert [shop_id for shop_id, _ in executor.calls] == [15]


def test_result_json_lists_every_suggestion_field() -> None:
    executor = FakeExecutor(rows=[row(sold_qty="14.5", stock_qty="0")], truncated=True)
    tool = build_restock_tool(RestockService(executor))

    text = tool.function(
        SimpleNamespace(deps=AgentContext(user_id=3, shop_id=15)),
        "last_7_days",
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
async def test_query_errors_go_back_to_the_model_and_the_turn_answers(
    error: Exception, expected: str
) -> None:
    conversations = FakeConversationRepository()
    model = suggest_then_answer({"period": "last_7_days"}, answer="Chưa tính được.")
    agent = build_agent(
        model,
        restock=RestockService(FakeExecutor(error=error)),
        conversations=conversations,
    )

    result = await agent.chat(user_id=3, shop_id=15, message="m")

    assert result.answer == "Chưa tính được."
    assert tool_results(model) == [
        f"{expected} Tell the owner the suggestion is unavailable."
    ]
    assert conversations.saved_exchange["assistant_message"] == "Chưa tính được."


@pytest.mark.parametrize(
    "error",
    [
        RuntimeError("sql reader unavailable"),
        ValueError("shop_id must be a positive integer"),
    ],
)
async def test_infrastructure_errors_fail_the_turn(error: Exception) -> None:
    conversations = FakeConversationRepository()
    model = suggest_then_answer({"period": "last_7_days"})
    agent = build_agent(
        model,
        restock=RestockService(FakeExecutor(error=error)),
        conversations=conversations,
    )

    with pytest.raises(type(error)):
        await agent.chat(user_id=3, shop_id=15, message="m")

    assert conversations.saved_exchange is None


async def test_agent_without_restock_has_no_suggest_restock_tool() -> None:
    model = ScriptedModel("ok")

    await build_agent(model, executor=FakeExecutor()).chat(
        user_id=3, shop_id=15, message="m"
    )

    assert model.tool_names() == ["query_shop_data"]


async def test_instructions_are_static_and_carry_the_restock_rules() -> None:
    executor = FakeExecutor(rows=[row()])
    model = suggest_then_answer({"period": "last_7_days"})

    await build_agent(model, executor=executor, restock=RestockService(executor)).chat(
        user_id=3, shop_id=15, message="m"
    )

    instructions = model.requests[0][1].instructions
    assert instructions == (
        f"{SHOP_AGENT_SYSTEM_PROMPT}\n\n{SQL_AGENT_PROMPT}\n\n{RESTOCK_PROMPT}"
    )
    assert "15" not in instructions


def test_restock_prompt_keeps_the_tool_values() -> None:
    assert "suggested_qty, unit and reason exactly" in RESTOCK_PROMPT
