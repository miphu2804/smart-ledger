import re
import unicodedata

MAX_HITS = 5
# About 2000 tokens at the 4 characters per token the summary batches assume.
MAX_RESULT_CHARS = 8000
NO_MATCH = "No earlier message in this conversation matches the query."


def normalize(text: str) -> str:
    # Shop owners often type Vietnamese without diacritics, so matching ignores them.
    # "đ" is a separate letter, not "d" plus a combining mark, so NFD leaves it intact.
    decomposed = unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def words(text: str) -> set[str]:
    return set(re.findall(r"\w+", normalize(text)))


def search_messages(
    messages: list[dict], query: str, max_hits: int = MAX_HITS
) -> list[list[dict]]:
    """Find the messages sharing the most words with the query.

    Each hit comes with the message before and after it, so a question travels with
    its answer. Overlapping neighbourhoods merge into one cluster, oldest first.
    """
    query_words = words(query)
    scored = [
        (len(query_words & words(message["content"])), position)
        for position, message in enumerate(messages)
    ]
    best = sorted(
        (item for item in scored if item[0] > 0),
        key=lambda item: (-item[0], -item[1]),
    )[:max_hits]
    positions = sorted(
        {
            neighbour
            for _, position in best
            for neighbour in (position - 1, position, position + 1)
            if 0 <= neighbour < len(messages)
        }
    )

    clusters: list[list[dict]] = []
    for index, position in enumerate(positions):
        if index > 0 and position == positions[index - 1] + 1:
            clusters[-1].append(messages[position])
        else:
            clusters.append([messages[position]])
    return clusters


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
