from src.agent.summary import (
    FOLD_TRIGGER_MESSAGES,
    KEEP_RECENT_MESSAGES,
    SUMMARY_BATCH_TOKENS,
    estimate_tokens,
    plan_fold,
    split_into_batches,
)


def history(count: int, content: str = "note") -> list[dict]:
    return [
        {"message_id": index + 1, "role": "USER", "content": content}
        for index in range(count)
    ]


def test_estimate_tokens_rounds_up() -> None:
    assert estimate_tokens("") == 0
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("abcde") == 2


def test_empty_history_plans_no_fold() -> None:
    plan = plan_fold([])

    assert plan.messages == []
    assert plan.batches == []


def test_history_exactly_at_trigger_plans_no_fold() -> None:
    plan = plan_fold(history(FOLD_TRIGGER_MESSAGES))

    assert plan.messages == []
    assert plan.batches == []


def test_history_above_trigger_keeps_recent_messages() -> None:
    plan = plan_fold(history(FOLD_TRIGGER_MESSAGES + 2))

    assert len(plan.messages) == FOLD_TRIGGER_MESSAGES + 2 - KEEP_RECENT_MESSAGES
    assert plan.messages[0]["message_id"] == 1
    assert (
        plan.messages[-1]["message_id"]
        == FOLD_TRIGGER_MESSAGES + 2 - KEEP_RECENT_MESSAGES
    )


def test_backlog_is_split_into_several_batches() -> None:
    backlog = history(200, content="x" * 400)

    plan = plan_fold(backlog)

    assert len(plan.batches) > 1
    assert [message for batch in plan.batches for message in batch] == plan.messages
    for batch in plan.batches:
        assert sum(estimate_tokens(item["content"]) for item in batch) <= (
            SUMMARY_BATCH_TOKENS
        )


def test_split_keeps_oversized_message_in_its_own_batch() -> None:
    oversized = {"message_id": 1, "role": "USER", "content": "x" * 40000}
    following = {"message_id": 2, "role": "USER", "content": "short"}

    batches = split_into_batches([oversized, following])

    assert batches == [[oversized], [following]]


def test_split_produces_no_empty_batch_for_empty_input() -> None:
    assert split_into_batches([]) == []
