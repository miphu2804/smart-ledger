"""Characterization pins for the failure codes and replay statuses of a receipted turn.

`AgentTurnService` is driven through its public methods with a stub repository and a
stub agent, so no database is needed; the PostgreSQL receipt suite covers the rest.
"""

from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.agent.errors import (
    ConversationNotFoundError,
    GuardrailError,
    TurnProtocolError,
)
from src.agent.turns import AgentTurnService

pytestmark = pytest.mark.anyio


class StubRepository:
    """Answers `get` with a fixed row; records each call and each `fail` code."""

    def __init__(self, row: dict | None = None):
        self.row = row
        self.calls: list[str] = []
        self.failed: list[str] = []

    def admit(self, turn_id, user_id, shop_id, conversation_id, message, fence):
        self.calls.append("admit")
        return True, None, "fingerprint"

    def get(self, turn_id, user_id, shop_id):
        self.calls.append("get")
        return self.row

    def cancel(self, turn_id, user_id, shop_id, fence):
        self.calls.append("cancel")

    def fail(self, execution, code):
        self.calls.append("fail")
        self.failed.append(code)


class FailingAgent:
    def __init__(self, error: Exception):
        self.error = error
        self.calls: list[str] = []

    async def chat(self, **kwargs):
        self.calls.append("chat")
        raise self.error

    async def stream_chat(self, **kwargs):
        self.calls.append("stream_chat")
        raise self.error


def payload():
    return SimpleNamespace(
        turn_id=uuid4(),
        user_id=7,
        shop_id=3,
        conversation_id=None,
        message="Doanh thu hôm nay?",
        execution_fence=1,
    )


async def admitted(service: AgentTurnService, request):
    _, _, execution = await service.admit(request)
    return execution


@pytest.mark.parametrize(
    ("state", "code", "status"),
    [
        ("CANCELLED", "ai_turn_cancelled", 409),
        ("FAILED", "conversation_not_found", 404),
        ("FAILED", "input_too_long", 422),
        ("FAILED", "answer_unavailable", 422),
        ("FAILED", "answer_timeout", 422),
        ("FAILED", "ai_unavailable", 503),
        ("FAILED", "guardrail_code_added_later", 503),
    ],
)
async def test_replay_of_an_ended_turn_raises_its_code_with_a_fixed_status(
    state, code, status
):
    repository = StubRepository({"state": state, "failure_code": code})
    service = AgentTurnService(repository, None, agent=None, enabled=True)

    with pytest.raises(TurnProtocolError) as raised:
        await service.replay(await admitted(service, payload()))

    assert (raised.value.code, raised.value.status) == (code, status)


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (GuardrailError("input_too_long"), "input_too_long"),
        (TurnProtocolError("ai_turn_conflict", 409), "ai_turn_conflict"),
        (ConversationNotFoundError(), "conversation_not_found"),
    ],
)
async def test_failed_chat_records_the_code_and_reraises_a_safe_error_unchanged(
    error, code
):
    repository = StubRepository()
    service = AgentTurnService(repository, None, FailingAgent(error), enabled=True)
    request = payload()

    with pytest.raises(type(error)) as raised:
        await service.chat(request, await admitted(service, request))

    assert raised.value is error
    assert repository.failed == [code]


async def test_failed_chat_hides_any_other_error_as_ai_unavailable():
    repository = StubRepository()
    agent = FailingAgent(RuntimeError("connection to 10.0.0.5 refused"))
    service = AgentTurnService(repository, None, agent, enabled=True)
    request = payload()

    with pytest.raises(TurnProtocolError) as raised:
        await service.chat(request, await admitted(service, request))

    assert (raised.value.code, raised.value.status) == ("ai_unavailable", 503)
    assert raised.value.__cause__ is None
    assert raised.value.__suppress_context__
    assert repository.failed == ["ai_unavailable"]


# The router relies on this gate: it no longer checks the flag before these calls.
@pytest.mark.parametrize(
    "enter",
    [
        pytest.param(lambda service: service.chat_turn(payload()), id="chat_turn"),
        pytest.param(lambda service: service.stream_turn(payload()), id="stream_turn"),
        pytest.param(lambda service: service.read(uuid4(), 7, 3), id="read"),
        pytest.param(lambda service: service.cancel(uuid4(), 7, 3, 1), id="cancel"),
    ],
)
async def test_disabled_turns_answer_unavailable_before_any_other_effect(enter):
    repository = StubRepository()
    agent = FailingAgent(RuntimeError("must not run"))
    service = AgentTurnService(repository, None, agent, enabled=False)

    with pytest.raises(TurnProtocolError) as raised:
        await enter(service)

    assert (raised.value.code, raised.value.status) == ("ai_turn_unavailable", 503)
    assert repository.calls == [] and agent.calls == []
