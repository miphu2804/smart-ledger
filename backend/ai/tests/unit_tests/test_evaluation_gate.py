from evaluation.core.gate import gate_failures, load_thresholds


def test_a_mean_below_its_minimum_fails() -> None:
    means = {"recall": (0.8, 100), "top1": (0.5, 100)}

    assert gate_failures(means, {"recall": 0.85, "top1": 0.5}) == [
        "recall: 0.80 < 0.85"
    ]


def test_a_mean_above_its_maximum_fails() -> None:
    means = {"stale_only": (0.08, 30), "recall": (0.9, 100)}

    failures = gate_failures(means, {"recall": 0.85}, {"stale_only": 0.05})

    assert failures == ["stale_only: 0.08 > 0.05"]


def test_a_gated_metric_no_row_scored_fails() -> None:
    failures = gate_failures(
        {"recall": (0.9, 100)}, {"top1": 0.5}, {"stale_only": 0.05}
    )

    assert failures == ["top1: no row scored it", "stale_only: no row scored it"]


def test_a_mean_on_its_bound_passes() -> None:
    means = {"recall": (0.85, 100), "stale_only": (0.05, 30)}

    assert gate_failures(means, {"recall": 0.85}, {"stale_only": 0.05}) == []


def test_thresholds_default_to_empty_tables(tmp_path) -> None:
    path = tmp_path / "thresholds.toml"
    path.write_text("[minimum]\nrecall = 0.85\n")

    assert load_thresholds(path) == {"minimum": {"recall": 0.85}, "maximum": {}}
