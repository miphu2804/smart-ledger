"""The calculation workflow: run a plan through the op set, then shape the answer.

`CalculationService` is the one use case the `calculate` tool exposes. It runs
in-process: no sandbox, no I/O, so a plain arithmetic turn costs nothing but the
tool call. Model-written programs run in the agent's separate sandbox option
(`src/sandbox/`); this service knows nothing about it."""

from dataclasses import dataclass

from src.calculation.ops import CalculationOutcome, CalculationStep, evaluate_plan


@dataclass(frozen=True)
class CalculationLimits:
    """Plan bounds; the composition root supplies them from config."""

    max_operations: int
    max_operand: float


class CalculationService:
    """Run one calculation plan against the closed op set."""

    def __init__(self, limits: CalculationLimits) -> None:
        self.limits = limits

    def calculate(self, steps: list[CalculationStep]) -> CalculationOutcome:
        """Evaluate the plan; raise `ValueError("CODE: reason")` when it is invalid."""
        return evaluate_plan(
            steps,
            max_operations=self.limits.max_operations,
            max_operand=self.limits.max_operand,
        )
