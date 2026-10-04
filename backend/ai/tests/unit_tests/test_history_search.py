from datetime import datetime

from src.agent.history_search import (
    NO_MATCH,
    format_clusters,
    search_messages,
)


def message(message_id: int, content: str, role: str = "USER") -> dict:
    return {
        "message_id": message_id,
        "role": role,
        "content": content,
        "created_at": datetime(2026, 10, 2),
    }


def ids(clusters: list[list[dict]]) -> list[list[int]]:
    return [[entry["message_id"] for entry in cluster] for cluster in clusters]


def test_search_ignores_case_and_diacritics_including_d_stroke() -> None:
    messages = [message(1, "Ch\u1ecb Lan n\u1ee3 \u0110\u1ed2NG")]

    assert ids(search_messages(messages, "dong")) == [[1]]


def test_search_matches_a_query_typed_without_diacritics() -> None:
    messages = [
        message(1, "Sold 3 more packs of noodles."),
        # Escaped accented text: the owner wrote it with diacritics, the query has none.
        message(2, "Ch\u1ecb Lan n\u1ee3 235.000 \u0111\u1ed3ng."),
        message(3, "Noted.", "ASSISTANT"),
        message(4, "Sold 5 more packs of noodles."),
    ]

    assert ids(search_messages(messages, "chi lan no")) == [[1, 2, 3]]


def test_search_ranks_by_shared_words_and_keeps_the_best_hits() -> None:
    messages = [message(index, "noodles") for index in range(1, 20)]
    messages[9] = message(10, "Lan buys noodles")

    clusters = search_messages(messages, "Lan noodles", max_hits=1)

    assert ids(clusters) == [[9, 10, 11]]


def test_search_merges_neighbouring_hits_into_one_cluster() -> None:
    messages = [
        message(1, "Lan owes for rice"),
        message(2, "Noted.", "ASSISTANT"),
        message(3, "Lan paid 100.000"),
        message(4, "Noted.", "ASSISTANT"),
        message(5, "Sold noodles"),
        message(6, "Sold noodles"),
        message(7, "Lan will pay on 15/10"),
    ]

    assert ids(search_messages(messages, "Lan")) == [[1, 2, 3, 4], [6, 7]]


def test_search_matches_whole_words_only() -> None:
    messages = [message(1, "Nothing new"), message(2, "Not today")]

    assert search_messages(messages, "no") == []


def test_format_clusters_reports_no_match_and_caps_length() -> None:
    assert format_clusters([]) == NO_MATCH

    text = format_clusters([[message(7, "x" * 100)]], max_chars=40)

    assert text.startswith("[#7 2026-10-02] USER: x")
    assert len(text) == 40
