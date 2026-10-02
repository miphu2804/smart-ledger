from datetime import datetime

from src.agent.history_search import (
    NO_MATCH,
    format_clusters,
    normalize,
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


def test_normalize_drops_vietnamese_diacritics_including_d_stroke() -> None:
    assert normalize("Chị Lan nợ ĐỒNG") == "chi lan no dong"


def test_search_matches_a_query_typed_without_diacritics() -> None:
    messages = [
        message(1, "Bán thêm 3 gói mì."),
        message(2, "Chị Lan nợ 235.000 đồng tiền gạo."),
        message(3, "Đã ghi nhận.", "ASSISTANT"),
        message(4, "Bán thêm 5 gói mì."),
    ]

    assert ids(search_messages(messages, "chi lan no")) == [[1, 2, 3]]


def test_search_ranks_by_shared_words_and_keeps_the_best_hits() -> None:
    messages = [message(index, "mì") for index in range(1, 20)]
    messages[9] = message(10, "chị Lan mua mì")

    clusters = search_messages(messages, "chị Lan mì", max_hits=1)

    assert ids(clusters) == [[9, 10, 11]]


def test_search_merges_neighbouring_hits_into_one_cluster() -> None:
    messages = [
        message(1, "Lan nợ tiền gạo"),
        message(2, "Đã ghi nhận.", "ASSISTANT"),
        message(3, "Lan trả 100.000"),
        message(4, "Đã ghi nhận.", "ASSISTANT"),
        message(5, "Bán mì"),
        message(6, "Bán mì"),
        message(7, "Lan hẹn trả 15/10"),
    ]

    assert ids(search_messages(messages, "Lan")) == [[1, 2, 3, 4], [6, 7]]


def test_search_matches_whole_words_only() -> None:
    messages = [message(1, "Trời nóng quá"), message(2, "Không nói gì")]

    assert search_messages(messages, "no") == []


def test_format_clusters_reports_no_match_and_caps_length() -> None:
    assert format_clusters([]) == NO_MATCH

    text = format_clusters([[message(7, "x" * 100)]], max_chars=40)

    assert text.startswith("[#7 2026-10-02] USER: x")
    assert len(text) == 40
