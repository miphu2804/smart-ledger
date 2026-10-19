"""The arithmetic operations the agent may compute, and the cases each op allows.

Domain module: an enum of operations, pure functions and one evaluation plan. No
framework, database or sandbox code. The agent reaches them through the `calculate`
tool (`src/agent/tools.py`); inside the Monty sandbox the model writes ordinary Python
instead, so the sandbox needs no plan here.

Errors follow the repo convention `ValueError("CODE: reason")`: the tool turns them
into `Error[CODE]: reason` text the model can fix and retry. The codes:

- `BAD_OPERATION`: unknown op, a missing or unexpected argument, or `$` in the first
  step (there is no previous result yet)
- `INVALID_NUMBER`: an operand or result is not a finite number (NaN or infinity)
- `OPERAND_TOO_LARGE`: |value| over the operand bound
- `RESULT_TOO_LARGE`: |result| over the operand bound
- `DIVISION_BY_ZERO`: divide with b = 0
- `TOO_MANY_OPERATIONS`: more steps than the plan allows
"""

from collections.abc import Callable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict


class CalculationOp(StrEnum):
    """The closed set of operations; the model sees these names in the tool schema."""

    ADD = "add"
    SUBTRACT = "subtract"
    MULTIPLY = "multiply"
    DIVIDE = "divide"
    # a percent of b: percentage(a=10, b=200) is 10% of 200 = 20
    PERCENTAGE = "percentage"
    # a, rounded to `digits` decimal places (0-6, default 0)
    ROUND = "round"
    MIN = "min"
    MAX = "max"


class CalculationStep(BaseModel):
    """One operation of a plan. `a` or `b` may be the string `$`, which stands for the
    previous step's result; the first step may not use it.

    Unknown keys are forbidden at the schema: a misspelled or unsupported key (say
    `decimals` for `digits`) fails validation naming the key, instead of being
    dropped silently and the step running without it.
    """

    model_config = ConfigDict(extra="forbid")

    op: CalculationOp
    a: float | Literal["$"]
    b: float | Literal["$"] | None = None
    # round only; other ops must leave it out
    digits: int | None = None


@dataclass(frozen=True)
class StepTrace:
    """One executed step, operands resolved, for the answer's audit trail."""

    op: CalculationOp
    a: float
    b: float | None
    result: float


@dataclass(frozen=True)
class CalculationOutcome:
    """The plan's final result and the trail that produced it."""

    result: float
    steps: list[StepTrace]


# Each op: its function, the argument names it reads from the step, and defaults for
# optional arguments — so a plan cannot pass an argument an op does not take, and an
# omitted optional argument gets its default.
_OPERATIONS: dict[
    CalculationOp, tuple[Callable[..., float], tuple[str, ...], dict[str, float]]
] = {
    CalculationOp.ADD: (lambda a, b: a + b, ("a", "b"), {}),
    CalculationOp.SUBTRACT: (lambda a, b: a - b, ("a", "b"), {}),
    CalculationOp.MULTIPLY: (lambda a, b: a * b, ("a", "b"), {}),
    CalculationOp.DIVIDE: (lambda a, b: a / b, ("a", "b"), {}),
    CalculationOp.PERCENTAGE: (lambda a, b: a / 100 * b, ("a", "b"), {}),
    # Half-up, the money convention: Python's round is banker's rounding, so
    # round(12500.5) would be 12500 where a shop owner expects 12501. A computed
    # float can sit one ulp below the exact value (35% of 170 is 59.4999…), so the
    # value first settles on a scale far finer than digits can be (MAX_ROUND_DIGITS
    # is 6); a genuine non-halfway value stays put at that scale, and only float
    # noise of a computed result moves. The final half-up quantize then sees the
    # exact boundary the arithmetic meant.
    CalculationOp.ROUND: (
        lambda a, digits=0: float(
            Decimal(str(a))
            .quantize(Decimal("1e-9"), rounding=ROUND_HALF_UP)
            .quantize(Decimal("1").scaleb(-digits), rounding=ROUND_HALF_UP)
        ),
        ("a",),
        {"digits": 0},
    ),
    CalculationOp.MIN: (lambda a, b: min(a, b), ("a", "b"), {}),
    CalculationOp.MAX: (lambda a, b: max(a, b), ("a", "b"), {}),
}

# round accepts this many decimal places; more loses meaning for shop numbers
MAX_ROUND_DIGITS = 6

_PREVIOUS = "$"


def evaluate_plan(
    steps: list[CalculationStep], *, max_operations: int, max_operand: float
) -> CalculationOutcome:
    """Run the plan step by step, carrying each result forward through `$`.

    Raises `ValueError("CODE: reason")` for a plan the constraints reject; see the
    module docstring for the codes.
    """
    if len(steps) > max_operations:
        raise ValueError(f"TOO_MANY_OPERATIONS: at most {max_operations} steps")
    if not steps:
        raise ValueError("BAD_OPERATION: the plan needs at least one step")

    trail: list[StepTrace] = []
    previous: float | None = None
    for index, step in enumerate(steps):
        func, required, defaults = _OPERATIONS[step.op]
        args: dict[str, float] = {}
        values = {"a": step.a, "b": step.b, "digits": step.digits}
        for name in (*required, *defaults):
            value = values[name]
            if value is None:
                if name in required:
                    raise ValueError(f"BAD_OPERATION: {step.op.value} needs {name}")
                args[name] = defaults[name]
            else:
                args[name] = _operand(value, previous, index, max_operand)
        unexpected = [
            name
            for name, value in values.items()
            if name not in required and name not in defaults and value is not None
        ]
        if unexpected:
            raise ValueError(
                f"BAD_OPERATION: {step.op.value} does not take {unexpected[0]}"
            )
        if step.op is CalculationOp.ROUND and not (
            0 <= args["digits"] <= MAX_ROUND_DIGITS
        ):
            raise ValueError(
                f"BAD_OPERATION: round takes digits from 0 to {MAX_ROUND_DIGITS}"
            )
        try:
            result = func(**args)
        except ZeroDivisionError as error:
            raise ValueError("DIVISION_BY_ZERO: divide needs b other than 0") from error
        trail.append(StepTrace(step.op, args["a"], args.get("b"), result))
        previous = _bounded(result, max_operand, code="RESULT_TOO_LARGE")
    return CalculationOutcome(result=previous, steps=trail)


def _operand(
    value: float | Literal["$"], previous: float | None, index: int, max_operand: float
) -> float:
    """Resolve one operand: `$` to the previous result, then the value checks.

    Round's digits passes through here too: it is always a finite int the checks
    hold for, and the plan bounds it to 0-6 in `evaluate_plan` instead.
    """
    if value == _PREVIOUS:
        if previous is None:
            raise ValueError(
                "BAD_OPERATION: $ has no previous result in the first step"
            )
        return previous
    return _bounded(value, max_operand, code="OPERAND_TOO_LARGE")


def _bounded(value: float, max_operand: float, *, code: str) -> float:
    """Return the value, or raise when it is not a finite number inside the bound."""
    if value != value or value in (float("inf"), float("-inf")):
        raise ValueError("INVALID_NUMBER: operands and results must be finite numbers")
    if abs(value) > max_operand:
        raise ValueError(f"{code}: |value| stays within {max_operand:g}")
    return value
