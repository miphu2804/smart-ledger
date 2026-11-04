from dataclasses import dataclass, field


@dataclass(frozen=True)
class Case:
    """One question put to a target, with what its scores need to know.

    `inputs` is what the target is given and what HoneyHive logs; `truth` is what only
    the metrics read. `id` repeats across the attempts of one question.
    """

    id: str
    inputs: dict
    truth: dict
    # The figures or names a reader of the results file should find in a good answer.
    expected: list = field(default_factory=list)


@dataclass
class Output:
    """What the target recorded for a case: the answer, tool calls, timing and so on."""

    values: dict


@dataclass(frozen=True)
class MetricResult:
    layer: str
    name: str
    score: float
    case_id: str
    reason: str | None = None


@dataclass
class CaseResult:
    case: Case
    output: Output
    metrics: list[MetricResult]
