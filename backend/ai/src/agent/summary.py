import math
from dataclasses import dataclass

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
