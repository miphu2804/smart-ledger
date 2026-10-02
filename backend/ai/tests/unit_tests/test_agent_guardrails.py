from types import SimpleNamespace

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from src.agent.guardrails import (
    EMPTY_ANSWER_REPLY,
    INPUT_TOO_LONG_REPLY,
    LEAK_REPLY,
    InputLengthGuard,
    OutputGuard,
    build_guardrails,
)
from src.agent.service import AgentService
from src.sql.executor import SqlResult

SETTINGS = SimpleNamespace(
    AGENT_MAX_INPUT_CHARS=200,
    AGENT_MODEL_CALL_LIMIT=4,
    AGENT_TOOL_CALL_LIMIT=3,
)
API_KEY = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345"
JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXZhbHVl"
BEARER = "Bearer abcdefghijklmnopqrstuvwxyz0123456789"
CARD = "4111 1111 1111 1111"


class RecordingModel(FakeMessagesListChatModel):
    seen_calls: list = []

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen_calls = [*self.seen_calls, list(messages)]
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


class LoopingModel(RecordingModel):
    """Asks for a tool on every call, with a fresh call id, and never answers."""

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen_calls = [*self.seen_calls, list(messages)]
        call_id = f"loop-{len(self.seen_calls)}"
        message = AIMessage(
            content="",
            tool_calls=[
                {"name": "query_shop_data", "args": {"sql": "SELECT 1"}, "id": call_id}
            ],
        )
        return ChatResult(generations=[ChatGeneration(message=message)])


class Conversations:
    def __init__(self, history: list[dict] | None = None) -> None:
        self.history = history or []
        self.saved_exchange: dict | None = None

    def context_for(self, conversation_id, user_id, shop_id):
        return {
            "summary": None,
            "summary_through_message_id": None,
            "messages": self.history,
        }

    def folded_messages(self, conversation_id, user_id, shop_id):
        return []

    def save_exchange(self, **kwargs):
        self.saved_exchange = kwargs
        return kwargs["conversation_id"] or 41, 72


class CountingExecutor:
    def __init__(self) -> None:
        self.calls = 0

    def run(self, shop_id: int, sql: str) -> SqlResult:
        self.calls += 1
        return SqlResult(columns=["n"], rows=[[1]], truncated=False)


def service(model, conversations=None, executor=None) -> AgentService:
    return AgentService(
        model,
        conversations or Conversations(),
        sql_executor=executor,
        guardrails=build_guardrails(SETTINGS),
    )


def answering(text: str) -> RecordingModel:
    return RecordingModel(responses=[AIMessage(content=text)])


def test_too_long_input_ends_the_run_without_a_model_call() -> None:
    model = answering("should not be called")
    conversations = Conversations()

    result = service(model, conversations).chat(
        user_id=3, shop_id=15, message="x" * 201
    )

    assert result.answer == INPUT_TOO_LONG_REPLY.format(limit=200)
    assert model.seen_calls == []
    assert conversations.saved_exchange["assistant_message"] == result.answer


def test_only_the_latest_message_counts_toward_the_input_limit() -> None:
    model = answering("ok")
    conversations = Conversations(
        [
            {"message_id": 1, "role": "USER", "content": "y" * 500},
            {"message_id": 2, "role": "ASSISTANT", "content": "z" * 500},
        ]
    )

    result = service(model, conversations).chat(
        user_id=3, shop_id=15, conversation_id=41, message="giá gạo?"
    )

    assert result.answer == "ok"
    assert len(model.seen_calls) == 1


def test_input_guard_reads_the_last_human_message() -> None:
    guard = InputLengthGuard(max_chars=5)
    state = {"messages": [HumanMessage("a" * 100), HumanMessage("short")]}

    assert guard.before_agent(state, None) is None


def test_secrets_are_redacted_before_the_model_and_in_history() -> None:
    model = answering("ok")
    conversations = Conversations()
    message = f"key {API_KEY} token {JWT} header {BEARER}"

    service(model, conversations).chat(user_id=3, shop_id=15, message=message)

    sent = model.seen_calls[0][-1].content
    for secret in (API_KEY, JWT, BEARER):
        assert secret not in sent
        assert secret not in conversations.saved_exchange["user_message"]
    assert "[REDACTED_API_KEY]" in sent


def test_card_numbers_are_masked_before_the_model() -> None:
    model = answering("ok")

    service(model).chat(user_id=3, shop_id=15, message=f"thẻ {CARD} nhé")

    sent = model.seen_calls[0][-1].content
    assert CARD not in sent
    assert "1111" in sent


def test_shop_phone_in_tool_results_is_not_redacted() -> None:
    class PhoneExecutor:
        def run(self, shop_id, sql):
            return SqlResult(columns=["phone"], rows=[["0901234567"]], truncated=False)

    model = RecordingModel(
        responses=[
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "query_shop_data",
                        "args": {"sql": "SELECT phone FROM v_shop_profile"},
                        "id": "c1",
                    }
                ],
            ),
            AIMessage(content="Số của tiệm là 0901234567."),
        ]
    )

    result = service(model, executor=PhoneExecutor()).chat(
        user_id=3, shop_id=15, message="số điện thoại tiệm?"
    )

    assert "0901234567" in model.seen_calls[-1][-1].content
    assert result.answer == "Số của tiệm là 0901234567."


@pytest.mark.parametrize(
    "answer",
    [
        "Mình đã chạy SELECT name FROM v_products WHERE status = 'ACTIVE'.",
        "Dữ liệu lấy từ ai_read.v_products.",
        "Lỗi Error[UNSAFE_TABLE] khi đọc dữ liệu.",
        "Mình cần set_config để đổi tiệm.",
        "Giá trị smartledger.shop_id là 15.",
    ],
)
def test_answers_that_leak_internals_are_replaced(answer: str) -> None:
    result = service(answering(answer)).chat(user_id=3, shop_id=15, message="m")

    assert result.answer == LEAK_REPLY


def test_empty_answer_gets_a_fallback() -> None:
    result = service(answering("   ")).chat(user_id=3, shop_id=15, message="m")

    assert result.answer == EMPTY_ANSWER_REPLY


def test_normal_vietnamese_answer_passes_through() -> None:
    answer = "Gạo ST25 đang bán 30.000đ/kg, còn 12 kg (tiệm hiện tại, dữ liệu lúc hỏi)."

    result = service(answering(answer)).chat(user_id=3, shop_id=15, message="m")

    assert result.answer == answer


def test_output_guard_keeps_the_answer_id_when_replacing() -> None:
    update = OutputGuard().after_agent(
        {"messages": [AIMessage(content="SELECT id FROM v_products", id="a1")]}, None
    )

    (replacement,) = update["messages"]
    assert replacement.id == "a1"
    assert replacement.content == LEAK_REPLY


def test_limits_stop_a_model_that_keeps_calling_tools() -> None:
    executor = CountingExecutor()
    model = LoopingModel(responses=[])

    result = service(model, executor=executor).chat(user_id=3, shop_id=15, message="m")

    assert len(model.seen_calls) == SETTINGS.AGENT_MODEL_CALL_LIMIT
    assert executor.calls == SETTINGS.AGENT_TOOL_CALL_LIMIT
    assert result.answer == EMPTY_ANSWER_REPLY
