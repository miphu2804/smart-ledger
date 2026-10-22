"""Pure rules that rank an owner's memories against a chat message (ADR-0002).

No I/O: the repository loads candidates and their cosine relevance, and this module
scores the words and orders them, so the ranking is testable without a database and
the recall benchmark (`evaluation/memory_recall/`) measures the same rule.

A memory ranks by cosine relevance + `LEXICAL_WEIGHT` * its share of the best BM25
score. BM25 runs over unaccented syllables and adjacent pairs, so "gao" finds "gạo"
when the embedding misses it. Both constants were chosen on the recall benchmark.
"""

import math
import re
import unicodedata
from collections import Counter
from collections.abc import Iterable

# Candidates from each channel: nearest by cosine and best by BM25.
CANDIDATES = 20
# Weight of the BM25 share added to cosine relevance.
LEXICAL_WEIGHT = 0.1
K1, B = 1.2, 0.75


def terms(text: str) -> list[str]:
    """Lowercased unaccented syllables, then each adjacent pair joined by "_"."""
    text = text.replace("đ", "d").replace("Đ", "D")
    plain = "".join(
        c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn"
    )
    syllables = re.findall(r"\w+", plain.lower())
    return syllables + [f"{a}_{b}" for a, b in zip(syllables, syllables[1:])]


def bm25(text: str, memories: Iterable[tuple[int, str]]) -> dict[int, float]:
    """BM25 of `text` against each `(id, content)`, over these memories alone.

    Only memories that share a term with `text` are returned. IDF comes from the
    owner's own memories, so a word every memory repeats weighs little.
    """
    docs = {memory_id: terms(content) for memory_id, content in memories}
    if not docs:
        return {}
    average = sum(len(words) for words in docs.values()) / len(docs)
    frequency = Counter(word for words in docs.values() for word in set(words))
    query = dict.fromkeys(terms(text))
    scores = {}
    for memory_id, words in docs.items():
        counts = Counter(words)
        norm = 1 - B + B * len(words) / average
        score = 0.0
        for word in query:
            if counts[word]:
                df = frequency[word]
                idf = math.log(1 + (len(docs) - df + 0.5) / (df + 0.5))
                score += idf * counts[word] * (K1 + 1) / (counts[word] + K1 * norm)
        if score > 0:
            scores[memory_id] = score
    return scores


def best_matches(lexical: dict[int, float]) -> list[int]:
    """The `CANDIDATES` ids with the highest BM25, best first."""
    return sorted(lexical, key=lexical.__getitem__, reverse=True)[:CANDIDATES]


def rank(relevance: dict[int, float], lexical: dict[int, float]) -> list[int]:
    """Ids of `relevance` best first, by cosine plus the weighted BM25 share."""
    best = max(lexical.values(), default=1.0)
    return sorted(
        relevance,
        key=lambda memory_id: (
            relevance[memory_id] + LEXICAL_WEIGHT * lexical.get(memory_id, 0.0) / best
        ),
        reverse=True,
    )
