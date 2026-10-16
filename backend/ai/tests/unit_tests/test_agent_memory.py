import asyncio
import json
import logging
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic_ai import Embedder
from pydantic_ai.embeddings import TestEmbeddingModel
from pydantic_ai.messages import ModelResponse, TextPart
from tests.support import TEST_GUARDRAIL_LIMITS, ScriptedModel, transcript

from src.agent.service import AgentService, Done, MemoryRecalled, TextDelta
from src.main import app
from src.memory.repository import MemoryGroup, RecalledMemory, StoredMemory
from src.memory.service import PHONE_NUMBER, AgentMemoryService
from src.prompt_templates import MEMORY_PROMPT

pytestmark = pytest.mark.anyio

RICE_SUPPLIER = "Anh nhập gạo ở chú Tư chợ Bà Chiểu."
SHORT_REPORTS = "Anh thích báo cáo ngắn gọn."
PREFERENCE = {"memory_type": "preference", "content": SHORT_REPORTS, "importance": 0.6}


class FakeMemoryRepository:
    def __init__(
        self,
        recalled=None,
        error: Exception | None = None,
        groups=None,
        enabled: bool = True,
        similar=None,
    ) -> None:
        self.recalled = recalled or []
        self.enabled = enabled
        self.error = error
        self.groups = groups or []
        self.similar_memories = similar or []
        self.searches: list[tuple] = []
        self.similar_searches: list[tuple] = []
        self.added: list[tuple] = []
        self.replaced: list[tuple] = []

    def search(self, shop_id, user_id, query, limit, preference_limit=0):
        if self.error is not None:
            raise self.error
        self.searches.append((shop_id, user_id, query, limit, preference_limit))
        return self.recalled

    def similar(self, shop_id, user_id, embeddings, min_relevance, limit, skipped):
        self.similar_searches.append(
            (shop_id, user_id, len(embeddings), min_relevance, limit, skipped)
        )
        return self.similar_memories

    def add(self, shop_id, user_id, conversation_id, memories):
        if self.error is not None:
            raise self.error
        self.added.append((shop_id, user_id, conversation_id, memories))

    def memory_enabled(self, shop_id, user_id):
        return self.enabled

    def set_memory_enabled(self, shop_id, user_id, enabled):
        self.enabled = enabled

    def due_for_summary(self, shop_id, user_id, older_than_days):
        return self.groups

    def replace(self, shop_id, user_id, group, summary):
        self.replaced.append((shop_id, user_id, group, summary))
        return True


class FakeConversationRepository:
    def __init__(self) -> None:
        self.saved_exchange: dict | None = None

    def recent_messages(self, conversation_id, user_id, shop_id, limit):
        return []

    def save_exchange(self, **kwargs):
        self.saved_exchange = kwargs
        return kwargs["conversation_id"] or 41, 72


def facts(*items: dict) -> str:
    return json.dumps({"facts": list(items)}, ensure_ascii=False)


def memory_service(
    model, repository: FakeMemoryRepository | None = None
) -> AgentMemoryService:
    return AgentMemoryService(
        model,
        repository or FakeMemoryRepository(),
        Embedder(TestEmbeddingModel(dimensions=2)),
        allowed_types=frozenset({"preference", "procedural"}),
    )


def recalled(content: str = RICE_SUPPLIER, memory_id: int = 7) -> RecalledMemory:
    return RecalledMemory(
        memory_id, content, "semantic", datetime(2026, 10, 1, tzinfo=UTC), 0.8, 41
    )


def agent_with(chat_model, memory, conversations=None) -> AgentService:
    return AgentService(
        chat_model,
        conversations or FakeConversationRepository(),
        TEST_GUARDRAIL_LIMITS,
        memory=memory,
    )


def sent_prompt(model: ScriptedModel, request: int = 0) -> str:
    """The last text the model read on that request: the new owner message."""
    return [
        text for kind, text in transcript(model.requests[request][0]) if kind == "user"
    ][-1]


async def test_without_memory_the_prompt_is_the_owner_message() -> None:
    model = ScriptedModel("ok")

    await agent_with(model, None).chat(user_id=3, shop_id=15, message="nhập gạo?")

    assert sent_prompt(model) == "nhập gạo?"
    assert MEMORY_PROMPT not in model.requests[0][1].instructions


async def test_recalled_memories_lead_the_prompt_but_not_the_stored_message() -> None:
    repository = FakeMemoryRepository(recalled=[recalled()])
    chat_model = ScriptedModel("Chú Tư.")
    conversations = FakeConversationRepository()
    agent = agent_with(
        chat_model,
        memory_service(ScriptedModel(facts()), repository),
        conversations,
    )

    await agent.chat(user_id=3, shop_id=15, message="nhập gạo ở đâu?")
    await asyncio.gather(*agent.memory_writes)

    (shop_id, user_id, _, limit, preference_limit) = repository.searches[0]
    assert (shop_id, user_id, limit, preference_limit) == (15, 3, 5, 10)
    assert sent_prompt(chat_model) == (
        "Earlier facts from this owner, with date and type, preferences first, then"
        " most relevant:\n"
        f"- (2026-10-01, semantic) {RICE_SUPPLIER}\n\n"
        "Owner message:\nnhập gạo ở đâu?"
    )
    assert MEMORY_PROMPT in chat_model.requests[0][1].instructions
    assert conversations.saved_exchange["user_message"] == "nhập gạo ở đâu?"


async def test_streamed_turns_get_the_same_memories() -> None:
    chat_model = ScriptedModel("Chú Tư.")
    agent = agent_with(
        chat_model,
        memory_service(
            ScriptedModel(facts()), FakeMemoryRepository(recalled=[recalled()])
        ),
    )

    events = await agent.stream_chat(user_id=3, shop_id=15, message="gạo?")
    async for _ in events:
        pass
    await asyncio.gather(*agent.memory_writes)

    assert RICE_SUPPLIER in sent_prompt(chat_model)


async def test_a_failed_search_answers_without_memories(
    caplog: pytest.LogCaptureFixture,
) -> None:
    chat_model = ScriptedModel("ok")
    repository = FakeMemoryRepository(error=RuntimeError("postgres down"))
    agent = agent_with(chat_model, memory_service(ScriptedModel(facts()), repository))

    with caplog.at_level(logging.WARNING):
        result = await agent.chat(user_id=3, shop_id=15, message="gạo?")
        await asyncio.gather(*agent.memory_writes)

    assert result.answer == "ok"
    assert sent_prompt(chat_model) == "gạo?"
    assert "memory not recalled: shop=15" in caplog.text


async def test_saved_turn_is_remembered_under_its_owner_and_conversation() -> None:
    extractor = ScriptedModel(facts(PREFERENCE))
    repository = FakeMemoryRepository()
    agent = agent_with(
        ScriptedModel("Dạ, em nhớ rồi."), memory_service(extractor, repository)
    )

    await agent.chat(
        user_id=3, shop_id=15, message="Anh nhập gạo ở chú Tư nhé", conversation_id=9
    )
    await asyncio.gather(*agent.memory_writes)

    (shop_id, user_id, conversation_id, memories) = repository.added[0]
    assert (shop_id, user_id, conversation_id) == (15, 3, 9)
    (memory,) = memories
    assert (memory.memory_type, memory.content, memory.importance) == (
        "preference",
        SHORT_REPORTS,
        0.6,
    )
    assert len(memory.embedding) == 2
    extracted_from = sent_prompt(extractor)
    assert "Anh nhập gạo ở chú Tư nhé" in extracted_from
    assert "Dạ, em nhớ rồi." in extracted_from


async def test_nothing_is_written_when_no_fact_is_extracted() -> None:
    repository = FakeMemoryRepository()

    await memory_service(ScriptedModel(facts()), repository).remember(
        15, 3, 9, "chào em", "Dạ chào anh.", []
    )

    assert repository.added == []


@pytest.mark.parametrize(
    "extractor",
    [
        ScriptedModel(ModelResponse(parts=[TextPart("not json")])),
        ScriptedModel(
            facts({"memory_type": "rumor", "content": "x", "importance": 0.5})
        ),
    ],
)
async def test_a_failed_extraction_is_logged_not_raised(
    extractor, caplog: pytest.LogCaptureFixture
) -> None:
    repository = FakeMemoryRepository()

    with caplog.at_level(logging.WARNING):
        await memory_service(extractor, repository).remember(15, 3, 9, "q", "a", [])

    assert repository.added == []
    assert "memory not stored: shop=15 conversation=9" in caplog.text


async def test_memory_dates_are_shop_days_not_utc_days() -> None:
    # 17:28 UTC on 14 October is 00:28 on 15 October in Vietnam.
    late_night = RecalledMemory(
        7,
        RICE_SUPPLIER,
        "semantic",
        datetime(2026, 10, 14, 17, 28, tzinfo=UTC),
        0.8,
        41,
    )
    service = memory_service(
        ScriptedModel(), FakeMemoryRepository(recalled=[late_night])
    )

    prompt, _ = await service.with_memories(15, 3, "gạo?")

    assert f"- (2026-10-15, semantic) {RICE_SUPPLIER}" in prompt


async def test_extraction_knows_today_to_date_events() -> None:
    extractor = ScriptedModel(facts())

    await memory_service(extractor).remember(
        15, 3, 9, "tuần trước máy đá hỏng", "Dạ.", []
    )

    assert "Today at the shop: " in sent_prompt(extractor)


def old_group() -> MemoryGroup:
    def stored(memory_id: int, content: str, importance: float) -> StoredMemory:
        return StoredMemory(
            memory_id,
            "semantic",
            content,
            importance,
            datetime(2026, 10, 1, tzinfo=UTC),
        )

    return MemoryGroup(
        9,
        date(2026, 10, 1),
        [
            stored(1, "Anh nhập gạo ở chú Tư.", 0.5),
            stored(2, "Chú Tư bán ở chợ Bà Chiểu.", 0.6),
        ],
    )


async def test_old_memories_of_a_chat_day_are_replaced_by_their_summary() -> None:
    group = old_group()
    model = ScriptedModel(
        facts(),
        facts(PREFERENCE),
    )
    repository = FakeMemoryRepository(groups=[group])

    await memory_service(model, repository).remember(15, 3, 9, "chào em", "Dạ.", [])

    summarized_from = sent_prompt(model, request=1)
    assert "Facts from 2026-10-01" in summarized_from
    assert "Chú Tư bán ở chợ Bà Chiểu." in summarized_from
    ((shop_id, user_id, replaced_group, summary),) = repository.replaced
    assert (shop_id, user_id, replaced_group) == (15, 3, group)
    assert [(memory.content, memory.importance) for memory in summary] == [
        (SHORT_REPORTS, 0.6)
    ]


async def test_an_empty_summary_keeps_the_old_memories(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # The model answers an empty list every time, so the summary never validates.
    model = ScriptedModel(facts(), *[facts()] * 3)
    repository = FakeMemoryRepository(groups=[old_group()])

    with caplog.at_level(logging.WARNING):
        await memory_service(model, repository).remember(15, 3, 9, "chào em", "Dạ.", [])

    assert repository.replaced == []
    assert "memory not summarized: shop=15" in caplog.text


async def test_an_owner_who_switched_memory_off_gets_no_recall_and_no_write() -> None:
    repository = FakeMemoryRepository(recalled=[recalled()], enabled=False)
    extractor = ScriptedModel()
    service = memory_service(extractor, repository)

    prompt, used = await service.with_memories(15, 3, "gạo?")
    await service.remember(15, 3, 9, "q", "a", [])

    assert (prompt, used) == ("gạo?", [])
    assert repository.searches == []
    assert extractor.requests == []
    assert repository.added == []


async def test_only_the_allowed_memory_types_are_written() -> None:
    extractor = ScriptedModel(
        facts(
            PREFERENCE,
            {"memory_type": "semantic", "content": RICE_SUPPLIER, "importance": 0.6},
            {"memory_type": "episodic", "content": "Máy đá hỏng.", "importance": 0.3},
        )
    )
    repository = FakeMemoryRepository()

    await memory_service(extractor, repository).remember(15, 3, 9, "q", "a", [])

    ((_, _, _, memories),) = repository.added
    assert [memory.memory_type for memory in memories] == ["preference"]


@pytest.mark.parametrize(
    "text",
    [
        "Số của chú Tư là 0901234567.",
        "Gọi 090 123 4567 nhé.",
        "Liên hệ +84 901 234 567.",
        "SĐT 0901.234.567",
        "Zalo 84-901-234-567",
    ],
)
def test_vietnamese_phone_numbers_are_detected(text: str) -> None:
    assert PHONE_NUMBER.search(text)


@pytest.mark.parametrize(
    "text",
    [
        "Mỗi ngày bán khoảng 120.000đ tiền đá.",
        "Nhập gạo 1.200.000đ một bao.",
        "Vốn 150.000.000 đồng.",
        "Chốt sổ lúc 22h30.",
    ],
)
def test_money_and_times_are_not_phone_numbers(text: str) -> None:
    assert PHONE_NUMBER.search(text) is None


async def test_facts_with_a_phone_number_are_dropped_from_extraction_and_summary():
    leaking = {**PREFERENCE, "content": "Gọi chú Tư số 0901234567."}
    model = ScriptedModel(facts(leaking, PREFERENCE), facts(leaking))
    repository = FakeMemoryRepository(groups=[old_group()])

    await memory_service(model, repository).remember(15, 3, 9, "q", "a", [])

    ((_, _, _, memories),) = repository.added
    assert [memory.content for memory in memories] == [SHORT_REPORTS]
    # Every summary fact was dropped, so the group stays rather than become nothing.
    assert repository.replaced == []


async def test_a_fact_may_replace_only_a_memory_this_turn_recalled() -> None:
    extractor = ScriptedModel(
        facts(
            {**PREFERENCE, "replaces": 7},
            {**PREFERENCE, "content": "Anh thích số liệu.", "replaces": 99},
        )
    )
    repository = FakeMemoryRepository()

    await memory_service(extractor, repository).remember(
        15, 3, 9, "q", "a", [recalled(memory_id=7)]
    )

    ((_, _, _, memories),) = repository.added
    assert [memory.supersedes for memory in memories] == [7, None]
    assert f"[7] {RICE_SUPPLIER}" in sent_prompt(extractor)


async def collect_events(agent: AgentService, message: str = "gạo?") -> list:
    events = await agent.stream_chat(user_id=3, shop_id=15, message=message)
    found = [event async for event in events]
    await asyncio.gather(*agent.memory_writes)
    return found


async def test_the_stream_names_recalled_memories_before_the_first_text() -> None:
    memory = recalled()
    agent = agent_with(
        ScriptedModel("Chú Tư."),
        memory_service(ScriptedModel(facts()), FakeMemoryRepository(recalled=[memory])),
    )

    events = await collect_events(agent)

    assert events[0] == MemoryRecalled([memory])
    assert isinstance(events[1], TextDelta)
    assert isinstance(events[-1], Done)


async def test_the_stream_has_no_memory_event_when_nothing_was_recalled() -> None:
    agent = agent_with(
        ScriptedModel("ok"),
        memory_service(ScriptedModel(facts()), FakeMemoryRepository()),
    )

    events = await collect_events(agent)

    assert not any(isinstance(event, MemoryRecalled) for event in events)


def test_the_sse_memory_event_lists_what_was_used(
    internal_headers: dict[str, str], wire_agent_state
) -> None:
    repository = FakeMemoryRepository(recalled=[recalled()])
    memory = memory_service(ScriptedModel(facts()), repository)
    wire_agent_state(
        agent_with(ScriptedModel("Chú Tư."), memory), FakeConversationRepository()
    )

    client = TestClient(app, headers=internal_headers)
    body = client.post(
        "/internal/v1/agent/chat/stream",
        json={"user_id": 3, "shop_id": 15, "message": "gạo?"},
    ).text

    frames = [frame for frame in body.split("\n\n") if frame.strip()]
    assert frames[0].splitlines()[0] == "event: memory"
    assert json.loads(frames[0].splitlines()[1].removeprefix("data: ")) == {
        "used": [
            {
                "id": 7,
                "memory_type": "semantic",
                "content": RICE_SUPPLIER,
                "source_conversation_id": 41,
                "created_at": "2026-10-01T00:00:00+00:00",
            }
        ]
    }


SETTINGS_URL = "/internal/v1/agent/memory/settings"


def test_settings_say_memory_is_unavailable_when_the_service_is_off(
    internal_headers: dict[str, str], wire_agent_state
) -> None:
    wire_agent_state(agent_with(ScriptedModel(), None), FakeConversationRepository())
    body = {"user_id": 3, "shop_id": 15, "memory_enabled": True}

    client = TestClient(app, headers=internal_headers)
    read = client.get(SETTINGS_URL, params={"user_id": 3, "shop_id": 15})
    write = client.put(SETTINGS_URL, json=body)

    assert read.json() == {"memory_enabled": False, "available": False}
    assert (write.status_code, write.json()) == (409, {"detail": "memory_unavailable"})


def test_settings_round_trip_through_the_memory_service(
    internal_headers: dict[str, str], wire_agent_state
) -> None:
    repository = FakeMemoryRepository()
    memory = memory_service(ScriptedModel(), repository)
    wire_agent_state(
        agent_with(ScriptedModel(), memory), FakeConversationRepository(), memory
    )

    client = TestClient(app, headers=internal_headers)
    before = client.get(SETTINGS_URL, params={"user_id": 3, "shop_id": 15})
    put = client.put(
        SETTINGS_URL, json={"user_id": 3, "shop_id": 15, "memory_enabled": False}
    )
    after = client.get(SETTINGS_URL, params={"user_id": 3, "shop_id": 15})

    assert before.json() == {"memory_enabled": True, "available": True}
    assert put.json() == {"memory_enabled": False, "available": True}
    assert after.json() == {"memory_enabled": False, "available": True}
    assert repository.enabled is False


NEW_SUPPLIER = "Anh chuyển sang lấy gạo của anh Tâm."
NEW_SUPPLIER_FACT = {
    "memory_type": "preference",
    "content": NEW_SUPPLIER,
    "importance": 0.6,
}


def stored(content: str = RICE_SUPPLIER, memory_id: int = 12) -> StoredMemory:
    return StoredMemory(
        memory_id, "preference", content, 0.6, datetime(2026, 10, 1, tzinfo=UTC)
    )


def decisions(*items: dict) -> str:
    return json.dumps({"decisions": list(items)})


async def test_a_fact_replaces_a_similar_memory_the_turn_did_not_recall() -> None:
    model = ScriptedModel(
        facts(NEW_SUPPLIER_FACT),
        decisions({"fact": 1, "action": "replaces", "replaces": 12}),
    )
    repository = FakeMemoryRepository(similar=[stored()])

    await memory_service(model, repository).remember(
        15, 3, 9, "doanh thu sao? À anh đổi qua gạo anh Tâm", "Dạ.", [recalled()]
    )

    ((_, _, _, memories),) = repository.added
    assert [(memory.content, memory.supersedes) for memory in memories] == [
        (NEW_SUPPLIER, 12)
    ]
    ((shop_id, user_id, embeddings, min_relevance, limit, skipped),) = (
        repository.similar_searches
    )
    assert (shop_id, user_id, embeddings, min_relevance, limit, skipped) == (
        15,
        3,
        1,
        0.6,
        3,
        [7],
    )
    reconciled_from = sent_prompt(model, request=1)
    assert f"[12] {RICE_SUPPLIER}" in reconciled_from
    assert f"1. {NEW_SUPPLIER}" in reconciled_from


async def test_a_fact_already_remembered_is_not_stored_again() -> None:
    model = ScriptedModel(
        facts(NEW_SUPPLIER_FACT, PREFERENCE),
        decisions({"fact": 1, "action": "known"}, {"fact": 2, "action": "new"}),
    )
    repository = FakeMemoryRepository(similar=[stored(NEW_SUPPLIER)])

    await memory_service(model, repository).remember(15, 3, 9, "q", "a", [])

    ((_, _, _, memories),) = repository.added
    assert [(memory.content, memory.supersedes) for memory in memories] == [
        (SHORT_REPORTS, None)
    ]


async def test_only_every_known_fact_means_nothing_is_written() -> None:
    model = ScriptedModel(facts(PREFERENCE), decisions({"fact": 1, "action": "known"}))
    repository = FakeMemoryRepository(similar=[stored(SHORT_REPORTS)])

    await memory_service(model, repository).remember(15, 3, 9, "q", "a", [])

    assert repository.added == []


async def test_no_similar_memory_skips_the_reconcile_model() -> None:
    model = ScriptedModel(facts(PREFERENCE))
    repository = FakeMemoryRepository()

    await memory_service(model, repository).remember(15, 3, 9, "q", "a", [])

    assert len(model.requests) == 1
    ((_, _, _, (memory,)),) = repository.added
    assert memory.supersedes is None


async def test_reconcile_may_replace_only_a_memory_it_was_shown() -> None:
    model = ScriptedModel(
        facts(NEW_SUPPLIER_FACT),
        decisions({"fact": 1, "action": "replaces", "replaces": 99}),
    )
    repository = FakeMemoryRepository(similar=[stored()])

    await memory_service(model, repository).remember(15, 3, 9, "q", "a", [])

    ((_, _, _, (memory,)),) = repository.added
    assert memory.supersedes is None


async def test_a_failed_reconcile_stores_the_facts_unchecked(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Every answer is invalid, so the reconcile output never validates.
    model = ScriptedModel(
        facts(NEW_SUPPLIER_FACT), *[ModelResponse(parts=[TextPart("not json")])] * 3
    )
    repository = FakeMemoryRepository(similar=[stored()])

    with caplog.at_level(logging.WARNING):
        await memory_service(model, repository).remember(15, 3, 9, "q", "a", [])

    ((_, _, _, (memory,)),) = repository.added
    assert (memory.content, memory.supersedes) == (NEW_SUPPLIER, None)
    assert "memory not reconciled: shop=15" in caplog.text


async def test_a_fact_replacing_a_recalled_memory_skips_the_reconcile() -> None:
    model = ScriptedModel(facts({**NEW_SUPPLIER_FACT, "replaces": 7}))
    repository = FakeMemoryRepository(similar=[stored()])

    await memory_service(model, repository).remember(
        15, 3, 9, "q", "a", [recalled(memory_id=7)]
    )

    assert repository.similar_searches == []
    ((_, _, _, (memory,)),) = repository.added
    assert memory.supersedes == 7
