import asyncio
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from pydantic_ai.models import Model

from src.llm_router.tier import Tier

logger = logging.getLogger(__name__)


class TierClassifier(Protocol):
    """Rates how much work a request takes; raises when it has no valid answer."""

    async def classify(self, user_messages: list[str]) -> Tier: ...


class Mechanism(StrEnum):
    """How a turn got its tier; logged and traced to compare the tier distribution."""

    CLASSIFIED = "classified"
    CONVERSATION = "conversation"
    FALLBACK = "fallback"


@dataclass(frozen=True)
class ModelSelection:
    tier: Tier
    alias: str
    model: Model
    mechanism: Mechanism


class LLMRouterService:
    """Routes each turn of a conversation to the model its request's tier needs.

    It knows no gateway, agent or prompt: the classifier rates the request, and the
    caller supplies the user messages and the model and alias of each tier. Provider
    retries and fallbacks stay with the gateway the models call; a classification that
    fails only routes the turn to the COMPLEX model.

    A conversation keeps the highest tier it has reached, as Bifrost's session-aware
    routing does, so an easy follow-up to a hard question stays on the stronger model
    and the provider's prompt cache. Once a conversation is COMPLEX the classifier is
    not asked again. The tiers live in this process for a day of inactivity; a restart
    only means the next turn is classified again.
    """

    def __init__(
        self,
        classifier: TierClassifier,
        models: dict[Tier, Model],
        aliases: dict[Tier, str],
        timeout_seconds: float,
        max_conversations: int = 10_000,
        ttl_seconds: float = 86_400,
    ) -> None:
        self.classifier = classifier
        self.models = models
        self.aliases = aliases
        self.timeout_seconds = timeout_seconds
        self.max_conversations = max_conversations
        self.ttl_seconds = ttl_seconds
        # conversation id -> (highest tier, when it was last used), oldest first
        self.tiers: OrderedDict[int, tuple[Tier, float]] = OrderedDict()

    async def route(
        self, conversation_id: int | None, user_messages: list[str]
    ) -> ModelSelection:
        """The model for this turn; never raises, a failed classification picks the
        strongest model.

        `user_messages` ends with the new request; earlier ones only resolve a
        follow-up such as "and last month?".
        """
        stored = self._stored_tier(conversation_id)
        if stored is Tier.COMPLEX:
            return self._selected(Tier.COMPLEX, Mechanism.CONVERSATION, conversation_id)
        try:
            classified = await asyncio.wait_for(
                self.classifier.classify(user_messages), self.timeout_seconds
            )
        except Exception as error:
            # Any failure, including the timeout, costs a stronger model, never a turn.
            logger.warning("model tier classification failed: %r", error)
            return self._selected(Tier.COMPLEX, Mechanism.FALLBACK, conversation_id)
        if stored is not None and stored > classified:
            return self._selected(stored, Mechanism.CONVERSATION, conversation_id)
        return self._selected(classified, Mechanism.CLASSIFIED, conversation_id)

    def remember(self, conversation_id: int, selection: ModelSelection) -> None:
        """Keep the turn's tier for the conversation's later turns.

        A fallback tier is not kept: one classifier outage would otherwise hold the
        conversation on the strongest model for a day.
        """
        if selection.mechanism is Mechanism.FALLBACK:
            return
        self.tiers[conversation_id] = (selection.tier, time.monotonic())
        self.tiers.move_to_end(conversation_id)
        while len(self.tiers) > self.max_conversations:
            self.tiers.popitem(last=False)

    def _stored_tier(self, conversation_id: int | None) -> Tier | None:
        if conversation_id is None or conversation_id not in self.tiers:
            return None
        tier, last_used = self.tiers[conversation_id]
        if time.monotonic() - last_used > self.ttl_seconds:
            del self.tiers[conversation_id]
            return None
        return tier

    def _selected(
        self, tier: Tier, mechanism: Mechanism, conversation_id: int | None
    ) -> ModelSelection:
        alias = self.aliases[tier]
        logger.info(
            "model tier %s (%s) for conversation %s: %s",
            tier.name,
            mechanism,
            conversation_id,
            alias,
        )
        return ModelSelection(tier, alias, self.models[tier], mechanism)
