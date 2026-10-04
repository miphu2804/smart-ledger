"""Keyword search over the messages already folded into a conversation's summary.

Backs the `search_chat_history` tool: the summary may drop an exact figure, name, date
or wording that the owner later asks about.
"""

import re
import unicodedata

MAX_HITS = 5
# About 2000 tokens at the 4 characters per token the summary batches assume.
MAX_RESULT_CHARS = 8000
NO_MATCH = "No earlier message in this conversation matches the query."


def search_messages(
    messages: list[dict], query: str, max_hits: int = MAX_HITS
) -> list[list[dict]]:
    """Find the messages sharing the most words with the query.

    Each hit comes with the message before and after it, so a question travels with
    its answer. Overlapping neighbourhoods merge into one cluster, oldest first.
    """
    hits = _best_hits(messages, query, max_hits)
    positions = _with_neighbours(hits, len(messages))
    return [[messages[position] for position in run] for run in _runs(positions)]


def format_clusters(
    clusters: list[list[dict]], max_chars: int = MAX_RESULT_CHARS
) -> str:
    if not clusters:
        return NO_MATCH
    text = "\n---\n".join(
        "\n".join(
            f"[#{message['message_id']} {message['created_at']:%Y-%m-%d}] "
            f"{message['role']}: {message['content']}"
            for message in cluster
        )
        for cluster in clusters
    )
    return text[:max_chars]


def _best_hits(messages: list[dict], query: str, max_hits: int) -> list[int]:
    """Positions of the messages sharing the most query words; the newer wins a tie."""
    query_words = _words(query)
    scores = {
        position: len(query_words & _words(message["content"]))
        for position, message in enumerate(messages)
    }
    matched = [position for position, score in scores.items() if score > 0]
    matched.sort(key=lambda position: (-scores[position], -position))
    return matched[:max_hits]


def _with_neighbours(positions: list[int], count: int) -> list[int]:
    return sorted(
        {
            neighbour
            for position in positions
            for neighbour in (position - 1, position, position + 1)
            if 0 <= neighbour < count
        }
    )


def _runs(positions: list[int]) -> list[list[int]]:
    """Group sorted positions into runs of consecutive numbers."""
    runs: list[list[int]] = []
    for position in positions:
        if runs and position == runs[-1][-1] + 1:
            runs[-1].append(position)
        else:
            runs.append([position])
    return runs


def _words(text: str) -> set[str]:
    return set(re.findall(r"\w+", _normalize(text)))


def _normalize(text: str) -> str:
    # Shop owners often type Vietnamese without diacritics, so matching ignores them.
    # U+0111 (d with stroke) is a separate letter, not "d" plus a combining mark, so
    # NFD leaves it intact.
    decomposed = unicodedata.normalize("NFD", text.lower().replace("\u0111", "d"))
    return "".join(char for char in decomposed if not unicodedata.combining(char))
