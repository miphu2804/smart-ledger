import pytest
from tests.support import ScriptedModel, tool_call, transcript

from src.agent.guardrails import (
    EMPTY_ANSWER_REPLY,
    INPUT_TOO_LONG_REPLY,
    LEAK_REPLY,
    TOOL_LIMIT_NOTICE,
    GuardrailLimits,
    redact_input,
)
from src.agent.service import AgentService

pytestmark = pytest.mark.anyio

MAX_INPUT_CHARS = 200
MODEL_CALL_LIMIT = 4
TOOL_CALL_LIMIT = 3
API_KEY = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345"
JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXZhbHVl"
BEARER = "Bearer abcdefghijklmnopqrstuvwxyz0123456789"
CARD = "4111 1111 1111 1111"
QUERY = {"sql": "SELECT 1"}


class Conversations:
    def __init__(self, history: list[dict] | None = None) -> None:
        self.history = history or []
        self.saved_exchange: dict | None = None

    def recent_messages(self, conversation_id, user_id, shop_id, limit):
        return self.history[-limit:]

    def save_exchange(self, **kwargs):
        self.saved_exchange = kwargs
        return kwargs["conversation_id"] or 41, 72


class CountingExecutor:
    def __init__(self) -> None:
        self.calls = 0

    def run(self, shop_id: int, sql: str) -> dict:
        self.calls += 1
        return {"columns": ["n"], "rows": [[1]], "truncated": False}


def service(model, conversations=None, executor=None) -> AgentService:
    return AgentService(
        model,
        conversations or Conversations(),
        GuardrailLimits(MAX_INPUT_CHARS, MODEL_CALL_LIMIT, TOOL_CALL_LIMIT),
        sql_executor=executor,
    )


def sent_prompt(model: ScriptedModel) -> str:
    """The owner's message as the model received it on the first request."""
    return transcript(model.requests[0][0])[-1][1]


async def test_too_long_input_ends_the_run_without_a_model_call() -> None:
    model = ScriptedModel("should not be called")
    conversations = Conversations()

    result = await service(model, conversations).chat(
        user_id=3, shop_id=15, message="x" * (MAX_INPUT_CHARS + 1)
    )

    assert result.answer == INPUT_TOO_LONG_REPLY.format(limit=MAX_INPUT_CHARS)
    assert model.requests == []
    assert conversations.saved_exchange["assistant_message"] == result.answer


async def test_only_the_latest_message_counts_toward_the_input_limit() -> None:
    model = ScriptedModel("ok")
    conversations = Conversations(
        [
            {"message_id": 1, "role": "USER", "content": "y" * 500},
            {"message_id": 2, "role": "ASSISTANT", "content": "z" * 500},
        ]
    )

    result = await service(model, conversations).chat(
        user_id=3, shop_id=15, conversation_id=41, message="rice price?"
    )

    assert result.answer == "ok"
    assert len(model.requests) == 1


async def test_secrets_are_redacted_before_the_model_and_in_history() -> None:
    model = ScriptedModel("ok")
    conversations = Conversations()
    message = f"key {API_KEY} token {JWT} header {BEARER}"

    await service(model, conversations).chat(user_id=3, shop_id=15, message=message)

    sent = sent_prompt(model)
    for secret in (API_KEY, JWT, BEARER):
        assert secret not in sent
        assert secret not in conversations.saved_exchange["user_message"]
    assert "[REDACTED_API_KEY]" in sent


async def test_card_numbers_are_masked_before_the_model() -> None:
    model = ScriptedModel("ok")

    await service(model).chat(user_id=3, shop_id=15, message=f"my card is {CARD}")

    assert sent_prompt(model) == "my card is **** **** **** 1111"


def test_only_card_numbers_that_pass_the_luhn_check_are_masked() -> None:
    assert redact_input("card 4111-1111-1111-1111") == "card ****-****-****-1111"
    assert redact_input("card 4111111111111111") == "card ************1111"
    # One digit off fails the checksum, so an order code of the same shape stays.
    assert redact_input("order 4111 1111 1111 1112") == "order 4111 1111 1111 1112"


async def test_shop_phone_in_tool_results_is_not_redacted() -> None:
    class PhoneExecutor:
        def run(self, shop_id, sql):
            return {"columns": ["phone"], "rows": [["0901234567"]], "truncated": False}

    model = ScriptedModel(
        tool_call("query_shop_data", {"sql": "SELECT phone FROM v_shop_profile"}),
        "The shop number is 0901234567.",
    )

    result = await service(model, executor=PhoneExecutor()).chat(
        user_id=3, shop_id=15, message="shop phone number?"
    )

    assert "0901234567" in transcript(model.requests[-1][0])[-1][1]
    assert result.answer == "The shop number is 0901234567."


@pytest.mark.parametrize(
    "answer",
    [
        "I ran SELECT name FROM v_products WHERE status = 'ACTIVE'.",
        "The data comes from ai_read.v_products.",
        "Got Error[UNSAFE_TABLE] while reading the data.",
        "I need set_config to switch shops.",
        "The smartledger.shop_id value is 15.",
    ],
)
async def test_answers_that_leak_internals_are_replaced(answer: str) -> None:
    result = await service(ScriptedModel(answer)).chat(
        user_id=3, shop_id=15, message="m"
    )

    assert result.answer == LEAK_REPLY


async def test_blank_answer_gets_a_fallback() -> None:
    result = await service(ScriptedModel("   ")).chat(
        user_id=3, shop_id=15, message="m"
    )

    assert result.answer == EMPTY_ANSWER_REPLY


async def test_model_that_never_answers_gets_a_fallback() -> None:
    # Pydantic AI asks again after an empty answer; giving up is not a 503.
    model = ScriptedModel(*[""] * MODEL_CALL_LIMIT)

    result = await service(model).chat(user_id=3, shop_id=15, message="m")

    assert result.answer == EMPTY_ANSWER_REPLY


async def test_normal_answer_passes_through() -> None:
    answer = "ST25 rice sells for 30.000 VND/kg, 12 kg left (this shop, as of now)."

    result = await service(ScriptedModel(answer)).chat(
        user_id=3, shop_id=15, message="m"
    )

    assert result.answer == answer


async def test_limits_stop_a_model_that_keeps_calling_tools() -> None:
    executor = CountingExecutor()
    model = ScriptedModel(
        *[tool_call("query_shop_data", QUERY) for _ in range(MODEL_CALL_LIMIT + 1)]
    )

    result = await service(model, executor=executor).chat(
        user_id=3, shop_id=15, message="m"
    )

    assert len(model.requests) == MODEL_CALL_LIMIT
    assert executor.calls == TOOL_CALL_LIMIT
    assert model.tool_names(request=TOOL_CALL_LIMIT) == []
    assert result.answer == EMPTY_ANSWER_REPLY


async def test_calls_over_the_tool_limit_are_refused_and_the_model_answers() -> None:
    executor = CountingExecutor()
    model = ScriptedModel(
        tool_call("query_shop_data", QUERY, QUERY),
        tool_call("query_shop_data", QUERY, QUERY),
        "answer from three results",
    )

    result = await service(model, executor=executor).chat(
        user_id=3, shop_id=15, message="m"
    )

    assert executor.calls == TOOL_CALL_LIMIT
    assert any(
        TOOL_LIMIT_NOTICE in text for _, text in transcript(model.requests[-1][0])
    )
    assert model.tool_names(request=2) == []
    assert result.answer == "answer from three results"


async def test_each_turn_gets_its_own_tool_budget() -> None:
    executor = CountingExecutor()
    model = ScriptedModel(
        *[tool_call("query_shop_data", QUERY) for _ in range(TOOL_CALL_LIMIT)],
        "first",
        tool_call("query_shop_data", QUERY),
        "second",
    )
    agent = service(model, executor=executor)

    await agent.chat(user_id=3, shop_id=15, message="m")
    result = await agent.chat(user_id=3, shop_id=15, message="m")

    assert executor.calls == TOOL_CALL_LIMIT + 1
    assert result.answer == "second"
