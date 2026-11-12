import asyncio

import pytest
from pydantic_ai.models.test import TestModel

from src.llm.model_router import LLMRouterService, Mechanism
from src.llm.tier import Tier

pytestmark = pytest.mark.anyio

MODELS = {tier: TestModel(model_name=tier.name.lower()) for tier in Tier}
ALIASES = {
    Tier.SIMPLE: "chat-simple",
    Tier.MEDIUM: "chat-medium",
    Tier.COMPLEX: "chat-complex",
}


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


def router(classifier: FakeClassifier, **options) -> LLMRouterService:
    return LLMRouterService(classifier, MODELS, ALIASES, timeout_seconds=0.5, **options)


async def turn(tiers: LLMRouterService, conversation_id: int | None, question="?"):
    selection = await tiers.route(conversation_id, [question])
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
    selection = await router(FakeClassifier(tier)).route(None, ["?"])

    assert (selection.tier, selection.alias) == (tier, alias)
    assert selection.model is MODELS[tier]
    assert selection.mechanism is Mechanism.CLASSIFIED


async def test_a_conversation_keeps_the_highest_tier_it_reached() -> None:
    tiers = router(FakeClassifier(Tier.SIMPLE, Tier.MEDIUM, Tier.SIMPLE))

    picked = [(await turn(tiers, 7)).tier for _ in range(3)]

    assert picked == [Tier.SIMPLE, Tier.MEDIUM, Tier.MEDIUM]


async def test_a_complex_conversation_is_not_classified_again() -> None:
    classifier = FakeClassifier(Tier.COMPLEX)
    tiers = router(classifier)

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
    tiers = router(classifier)

    selection = await turn(tiers, 7)

    assert (selection.tier, selection.mechanism) == (Tier.COMPLEX, Mechanism.FALLBACK)
    assert tiers.tiers == {}


async def test_a_new_conversation_stores_nothing_until_it_is_saved() -> None:
    tiers = router(FakeClassifier(Tier.MEDIUM))

    await turn(tiers, None)

    assert tiers.tiers == {}


async def test_an_idle_conversation_is_classified_afresh() -> None:
    tiers = router(FakeClassifier(Tier.COMPLEX, Tier.SIMPLE), ttl_seconds=0)

    await turn(tiers, 7)
    selection = await turn(tiers, 7)

    assert selection.tier is Tier.SIMPLE


async def test_the_least_recent_conversation_is_dropped_past_the_cap() -> None:
    tiers = router(FakeClassifier(*[Tier.MEDIUM] * 3), max_conversations=2)

    for conversation_id in (1, 2, 3):
        await turn(tiers, conversation_id)

    assert list(tiers.tiers) == [2, 3]
