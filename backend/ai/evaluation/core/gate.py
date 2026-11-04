import tomllib
from pathlib import Path


def load_thresholds(path: Path) -> dict[str, dict[str, float]]:
    """The `[minimum]` and `[maximum]` tables of a suite's `thresholds.toml`."""
    thresholds = tomllib.loads(path.read_text())
    return {
        "minimum": thresholds.get("minimum", {}),
        "maximum": thresholds.get("maximum", {}),
    }


def gate_failures(
    means: dict[str, tuple[float, int]],
    minimums: dict[str, float],
    maximums: dict[str, float] | None = None,
) -> list[str]:
    """Each gated metric whose mean is below its minimum or above its maximum; one with
    no row fails too, because a gate that measured nothing passed nothing."""
    failures = []
    for metric, minimum in minimums.items():
        if metric not in means:
            failures.append(f"{metric}: no row scored it")
        elif means[metric][0] < minimum:
            failures.append(f"{metric}: {means[metric][0]:.2f} < {minimum:g}")
    for metric, maximum in (maximums or {}).items():
        if metric not in means:
            failures.append(f"{metric}: no row scored it")
        elif means[metric][0] > maximum:
            failures.append(f"{metric}: {means[metric][0]:.2f} > {maximum:g}")
    return failures
