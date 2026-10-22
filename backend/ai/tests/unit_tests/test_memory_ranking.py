from src.memory import ranking


def test_terms_drop_accents_and_add_adjacent_pairs():
    assert ranking.terms("Tiền điện") == ["tien", "dien", "tien_dien"]


def test_an_unaccented_word_finds_the_accented_memory():
    scores = ranking.bm25("gao", [(1, "Nhập gạo ở chợ Bình Tây"), (2, "Bán nước mắm")])

    assert list(scores) == [1]


def test_the_adjacent_pair_lifts_the_memory_with_the_whole_phrase():
    scores = ranking.bm25(
        "tiền điện", [(1, "tiền nhà tháng này"), (2, "tiền điện tháng này")]
    )

    assert scores[2] > scores[1]


def test_no_memories_score_nothing():
    assert ranking.bm25("gạo", []) == {}


def test_best_matches_keep_the_candidate_count():
    lexical = {memory_id: float(memory_id) for memory_id in range(50)}

    best = ranking.best_matches(lexical)

    assert len(best) == ranking.CANDIDATES
    assert best[0] == 49


def test_a_word_match_breaks_a_near_tie_in_cosine():
    relevance = {1: 0.60, 2: 0.58}

    assert ranking.rank(relevance, {2: 3.0}) == [2, 1]


def test_a_word_match_does_not_outweigh_a_clearly_closer_memory():
    relevance = {1: 0.80, 2: 0.50}

    assert ranking.rank(relevance, {2: 3.0}) == [1, 2]


def test_without_word_matches_cosine_alone_ranks():
    assert ranking.rank({1: 0.2, 2: 0.9, 3: 0.5}, {}) == [2, 3, 1]
