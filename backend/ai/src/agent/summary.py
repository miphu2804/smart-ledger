import logging
import math
from dataclasses import dataclass

from langchain_core.language_models import BaseChatModel

from src.agent.repository import AgentConversationRepository, ConversationNotFoundError
from src.prompt_templates import (
    CHAT_SUMMARY_EMPTY,
    CHAT_SUMMARY_INPUT,
    CHAT_SUMMARY_PROMPT,
)

logger = logging.getLogger(__name__)

# The verbatim window keeps KEEP_RECENT_MESSAGES and may grow to FOLD_TRIGGER_MESSAGES
# before the oldest messages are folded, so one fold costs the same for a whole batch.
KEEP_RECENT_MESSAGES = 50
FOLD_TRIGGER_MESSAGES = 60
SUMMARY_BATCH_TOKENS = 3000
CHARS_PER_TOKEN = 4


@dataclass(frozen=True)
class FoldPlan:
    messages: list[dict]
    batches: list[list[dict]]


def estimate_tokens(text: str) -> int:
    # Approximation instead of tokenizer: only used to size batches.
    return math.ceil(len(text) / CHARS_PER_TOKEN)


def plan_fold(unfolded: list[dict]) -> FoldPlan:
    """Split the messages outside the verbatim window into summarization batches.

    Returns an empty plan while the unfolded history still fits the window, which is
    what keeps most turns from calling the summarization model at all.
    """
    if len(unfolded) <= FOLD_TRIGGER_MESSAGES:
        return FoldPlan(messages=[], batches=[])
    messages = unfolded[: len(unfolded) - KEEP_RECENT_MESSAGES]
    return FoldPlan(messages=messages, batches=split_into_batches(messages))


def split_into_batches(
    messages: list[dict], token_budget: int = SUMMARY_BATCH_TOKENS
) -> list[list[dict]]:
    """Group messages so each batch stays within the token budget.

    A message larger than the budget on its own becomes a batch of one rather than
    being dropped or looping.
    """
    batches: list[list[dict]] = []
    current: list[dict] = []
    used = 0
    for message in messages:
        cost = estimate_tokens(message["content"])
        if current and used + cost > token_budget:
            batches.append(current)
            current = []
            used = 0
        current.append(message)
        used += cost
    if current:
        batches.append(current)
    return batches


class ChatSummaryFolder:
    """Fold messages that left the verbatim window into the stored summary.

    Runs as a background task after the reply was already sent, so `fold` never raises:
    a model or database failure leaves the stored summary untouched, and the next turn
    retries it.
    """

    def __init__(
        self,
        summary_model: BaseChatModel | None,
        conversations: AgentConversationRepository,
    ) -> None:
        self.summary_model = summary_model
        self.conversations = conversations

    def fold(self, conversation_id: int, user_id: int, shop_id: int) -> bool:
        """Rewrite the summary for every batch outside the verbatim window.

        Returns whether any fold was persisted.
        """
        if self.summary_model is None:
            return False
        try:
            context = self.conversations.context_for(conversation_id, user_id, shop_id)
        except ConversationNotFoundError:
            # The owner deleted the conversation while this task was queued.
            return False

        plan = plan_fold(context["messages"])
        if not plan.messages:
            return False

        summary = context["summary"]
        watermark = context["summary_through_message_id"]
        folded = False
        for batch in plan.batches:
            rewritten = self._rewrite_summary(summary, batch)
            if rewritten is None:
                break
            batch_through_id = batch[-1]["message_id"]
            if not self.conversations.save_summary(
                conversation_id=conversation_id,
                user_id=user_id,
                shop_id=shop_id,
                summary=rewritten,
                through_id=batch_through_id,
                expected_through_id=watermark,
            ):
                # A concurrent fold advanced the watermark first, so this is stale.
                break
            summary = rewritten
            watermark = batch_through_id
            folded = True
        return folded

    def _rewrite_summary(self, summary: str | None, batch: list[dict]) -> str | None:
        transcript = "\n".join(
            f"{entry['role']}: {entry['content']}" for entry in batch
        )
        try:
            response = self.summary_model.invoke(
                [
                    {"role": "system", "content": CHAT_SUMMARY_PROMPT},
                    {
                        "role": "user",
                        "content": CHAT_SUMMARY_INPUT.format(
                            summary=summary or CHAT_SUMMARY_EMPTY,
                            messages=transcript,
                        ),
                    },
                ]
            )
        except Exception:
            logger.warning("chat summary model failed", exc_info=True)
            return None
        rewritten = response.text.strip()
        return rewritten or None
