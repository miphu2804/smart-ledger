import asyncio

import pytest
from pydantic_ai.models.test import TestModel

from src.agent.model_tier import Tier
from src.agent.model_tier_selector import Mechanism, ModelTierSelector

pytestmark = pytest.mark.anyio

MODELS = {tier: TestModel(model_name=tier.name.lower()) for tier in Tier}


class FakeClassifier:
    """Answers with the queued tiers in order; an exception in the queue is raised."""

    def __init__(self, *answers: Tier | Exception, delay: float = 0) -> None:
        self.answers = list(answers)
        self.delay = delay
        self.requests: list[list[str]] = []

    async def classify(self, user_messages: list[str]) -> Tier:
        self.requests.append(user_messages)
        await asyncio.sleep(self.delay)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def selector(classifier: FakeClassifier, **options) -> ModelTierSelector:
    return ModelTierSelector(classifier, MODELS, timeout_seconds=0.5, **options)


async def turn(tiers: ModelTierSelector, conversation_id: int | None, question="?"):
    selection = await tiers.select(conversation_id, question, [])
    if conversation_id is not None:
        tiers.remember(conversation_id, selection)
    return selection


@pytest.mark.parametrize(
    ("tier", "alias"),
    [
        (Tier.SIMPLE, "chat-simple"),
        (Tier.MEDIUM, "chat-medium"),
        (Tier.COMPLEX, "chat-complex"),
    ],
)
async def test_each_tier_runs_on_its_alias(tier: Tier, alias: str) -> None:
    selection = await selector(FakeClassifier(tier)).select(None, "?", [])

    assert (selection.tier, selection.alias) == (tier, alias)
    assert selection.model is MODELS[tier]
    assert selection.mechanism is Mechanism.CLASSIFIED


async def test_a_conversation_keeps_the_highest_tier_it_reached() -> None:
    tiers = selector(FakeClassifier(Tier.SIMPLE, Tier.MEDIUM, Tier.SIMPLE))

    picked = [(await turn(tiers, 7)).tier for _ in range(3)]

    assert picked == [Tier.SIMPLE, Tier.MEDIUM, Tier.MEDIUM]


async def test_a_complex_conversation_is_not_classified_again() -> None:
    classifier = FakeClassifier(Tier.COMPLEX)
    tiers = selector(classifier)

    await turn(tiers, 7)
    selection = await turn(tiers, 7)

    assert len(classifier.requests) == 1
    assert (selection.tier, selection.mechanism) == (
        Tier.COMPLEX,
        Mechanism.CONVERSATION,
    )


@pytest.mark.parametrize(
    "classifier",
    [
        FakeClassifier(RuntimeError("down")),
        FakeClassifier(KeyError("REFUSAL")),
        FakeClassifier(Tier.SIMPLE, delay=1),
    ],
    ids=["error", "invalid answer", "timeout"],
)
async def test_a_failed_classification_runs_complex_and_is_not_kept(
    classifier: FakeClassifier,
) -> None:
    tiers = selector(classifier)

    selection = await turn(tiers, 7)

    assert (selection.tier, selection.mechanism) == (Tier.COMPLEX, Mechanism.FALLBACK)
    assert tiers.tiers == {}


async def test_only_the_previous_owner_message_leads_the_question() -> None:
    classifier = FakeClassifier(Tier.SIMPLE)
    history = [
        {"role": "USER", "content": "revenue today?"},
        {"role": "ASSISTANT", "content": "1.200.000 VND"},
        {"role": "USER", "content": "and this week?"},
        {"role": "ASSISTANT", "content": "8.400.000 VND"},
    ]

    await selector(classifier).select(7, "and last week?", history)

    assert classifier.requests == [["and this week?", "and last week?"]]


async def test_a_new_conversation_stores_nothing_until_it_is_saved() -> None:
    tiers = selector(FakeClassifier(Tier.MEDIUM))

    await turn(tiers, None)

    assert tiers.tiers == {}


async def test_an_idle_conversation_is_classified_afresh() -> None:
    tiers = selector(FakeClassifier(Tier.COMPLEX, Tier.SIMPLE), ttl_seconds=0)

    await turn(tiers, 7)
    selection = await turn(tiers, 7)

    assert selection.tier is Tier.SIMPLE


async def test_the_least_recent_conversation_is_dropped_past_the_cap() -> None:
    tiers = selector(FakeClassifier(*[Tier.MEDIUM] * 3), max_conversations=2)

    for conversation_id in (1, 2, 3):
        await turn(tiers, conversation_id)

    assert list(tiers.tiers) == [2, 3]
