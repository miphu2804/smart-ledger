import pytest
from evaluation.core.report import compute_averages
from evaluation.core.schema import Case, Output
from evaluation.memory.recall import RecallEvaluator

pytestmark = pytest.mark.anyio


async def results_of(
    recalled: list[int], gold: int, form: str, stale: int | None = None
):
    case = Case("c", {}, {"gold": gold, "form": form, "stale": stale})
    return await RecallEvaluator().evaluate(case, Output({"recalled": recalled}))


async def scores_of(
    recalled: list[int], gold: int, form: str, stale: int | None = None
):
    results = await results_of(recalled, gold, form, stale)
    return {metric.name: metric.score for metric in results}


async def test_recall_counts_the_needed_memory_anywhere_in_the_returned_ones() -> None:
    assert (await scores_of([4, 7, 2], 2, "lex"))["recall"] == 1
    assert (await scores_of([4, 7, 3], 2, "lex"))["recall"] == 0
    assert (await scores_of([], 2, "lex"))["recall"] == 0


async def test_recall_by_form_exists_only_for_the_forms_own_queries() -> None:
    scores = await scores_of([2], 2, "unacc")

    assert scores["recall_unacc"] == 1
    assert "recall_lex" not in scores and "recall_sem" not in scores


async def test_top1_needs_the_needed_memory_first() -> None:
    assert (await scores_of([2, 7], 2, "sem"))["top1"] == 1
    assert (await scores_of([7, 2], 2, "sem"))["top1"] == 0
    assert (await scores_of([], 2, "sem"))["top1"] == 0


async def test_stale_only_flags_the_older_version_returned_without_the_newer() -> None:
    assert (await scores_of([5, 9], 6, "lex", stale=5))["stale_only"] == 1
    assert (await scores_of([5, 6], 6, "lex", stale=5))["stale_only"] == 0
    assert (await scores_of([9], 6, "lex", stale=5))["stale_only"] == 0
    assert "stale_only" not in await scores_of([5], 6, "lex")


async def test_means_over_rows_are_the_shares_the_gate_reads() -> None:
    rows = [
        await scores_of([1], 1, "lex"),
        await scores_of([2, 1], 1, "lex"),
        await scores_of([3], 1, "sem", stale=3),
    ]

    means = compute_averages(rows)

    assert means["recall"] == (2 / 3, 3)
    assert means["recall_lex"] == (1.0, 2)
    assert means["recall_sem"] == (0.0, 1)
    assert means["top1"] == (1 / 3, 3)
    assert means["stale_only"] == (1.0, 1)


async def test_every_memory_metric_belongs_to_the_memory_layer() -> None:
    results = await results_of([5], 6, "lex", stale=5)

    assert {metric.layer for metric in results} == {"memory"}
