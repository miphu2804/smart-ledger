"""Constraint cases of the calculation plan: the ops, the bounds and the errors.

`evaluate_plan` raises `ValueError("CODE: reason")`; every case here pins one code, so
the tool can keep returning `Error[CODE]` text to the model and nothing else escapes.
"""

import pytest
from pydantic import ValidationError

from src.calculation.ops import MAX_ROUND_DIGITS, CalculationOp, CalculationStep
from src.calculation.service import CalculationLimits, CalculationService

LIMITS = CalculationLimits(max_operations=5, max_operand=1_000_000)


def service() -> CalculationService:
    return CalculationService(LIMITS)


def outcome(steps: list[CalculationStep]) -> float:
    return service().calculate(steps).result


def step(op: str, a, b=None, digits=None) -> CalculationStep:
    return CalculationStep.model_validate(
        {
            "op": op,
            "a": a,
            **({"b": b} if b is not None else {}),
            **({"digits": digits} if digits is not None else {}),
        }
    )


class TestOps:
    def test_add_subtract_multiply_divide(self) -> None:
        assert outcome([step("add", 2, 3)]) == 5
        assert outcome([step("subtract", 2, 3)]) == -1
        assert outcome([step("multiply", 2, 3)]) == 6
        assert outcome([step("divide", 3, 4)]) == 0.75

    def test_percentage_is_a_percent_of_b(self) -> None:
        assert outcome([step("percentage", 10, 350000)]) == 35000

    def test_round_defaults_to_whole_numbers(self) -> None:
        assert outcome([step("round", 12500.5)]) == 12501
        assert outcome([step("round", 12500.5, digits=0)]) == 12501
        assert outcome([step("round", 12500.4, digits=1)]) == 12500.4

    def test_round_half_up_sees_the_exact_boundary_of_a_computed_result(self) -> None:
        # 35% of 170 is exactly 59.5, but the float of the percentage step sits one
        # ulp below it; the round op must still give the money answer, 60.
        steps = [step("percentage", 35, 170), step("round", "$", digits=0)]
        assert outcome(steps) == 60

    def test_min_and_max(self) -> None:
        assert outcome([step("min", 2, 3)]) == 2
        assert outcome([step("max", 2, 3)]) == 3

    def test_carry_the_previous_result_through_dollar(self) -> None:
        steps = [step("multiply", 12, 25000), step("percentage", 10, "$")]
        assert outcome(steps) == 30000

    def test_the_last_step_is_the_result(self) -> None:
        steps = [step("add", 1, 1), step("multiply", "$", 2), step("add", "$", 0.5)]
        assert outcome(steps) == 4.5

    def test_float_noise_is_reported_unchanged_in_the_trail(self) -> None:
        result = service().calculate([step("add", 0.1, 0.2)])
        # The trail is the audit of what ran: the raw float stays in it, and the
        # tool rounds the reported result instead.
        assert result.steps[-1].result == 0.30000000000000004


class TestStepSchema:
    def test_unknown_operation_is_rejected_at_the_schema(self) -> None:
        with pytest.raises(ValidationError):
            CalculationStep.model_validate({"op": "modulo", "a": 1, "b": 2})

    def test_an_unexpected_key_is_rejected_at_the_schema(self) -> None:
        # extra=forbid: the model learns the key name in the validation error and
        # can fix the call. Before the forbid, "decimals" was dropped and the step
        # ran as round with the default digits=0 — a wrong figure, no error.
        with pytest.raises(ValidationError):
            CalculationStep.model_validate(
                {"op": "round", "a": 12500.55, "decimals": 2}
            )

    def test_every_operation_name_is_in_the_enum(self) -> None:
        assert CalculationOp.ADD.value == "add"


class TestPlanConstraints:
    def test_empty_plan(self) -> None:
        with pytest.raises(ValueError, match="BAD_OPERATION"):
            outcome([])

    def test_too_many_steps(self) -> None:
        steps = [step("add", 1, 1) for _ in range(LIMITS.max_operations + 1)]
        with pytest.raises(ValueError, match="TOO_MANY_OPERATIONS"):
            outcome(steps)

    def test_dollar_in_the_first_step(self) -> None:
        with pytest.raises(ValueError, match="BAD_OPERATION.*no previous result"):
            outcome([step("add", "$", 1)])

    def test_missing_b(self) -> None:
        with pytest.raises(ValueError, match="BAD_OPERATION.*needs b"):
            outcome([step("add", 1)])

    def test_digits_on_an_op_that_does_not_take_it(self) -> None:
        with pytest.raises(ValueError, match="BAD_OPERATION.*does not take digits"):
            outcome([step("add", 1, 2, digits=2)])

    def test_round_digits_out_of_range(self) -> None:
        with pytest.raises(ValueError, match="BAD_OPERATION.*digits from 0 to"):
            outcome([step("round", 1.5, digits=MAX_ROUND_DIGITS + 1)])
        with pytest.raises(ValueError, match="BAD_OPERATION.*digits from 0 to"):
            outcome([step("round", 1.5, digits=-1)])

    def test_division_by_zero(self) -> None:
        with pytest.raises(ValueError, match="DIVISION_BY_ZERO"):
            outcome([step("divide", 1, 0)])

    def test_not_a_finite_number(self) -> None:
        with pytest.raises(ValueError, match="INVALID_NUMBER"):
            outcome([step("add", float("inf"), 1)])
        with pytest.raises(ValueError, match="INVALID_NUMBER"):
            outcome([step("add", float("nan"), 1)])

    def test_operand_over_the_bound(self) -> None:
        with pytest.raises(ValueError, match="OPERAND_TOO_LARGE"):
            outcome([step("add", 1_000_001, 0)])

    def test_result_over_the_bound(self) -> None:
        with pytest.raises(ValueError, match="RESULT_TOO_LARGE"):
            outcome([step("multiply", 1_000_000, 1_000_000)])

    def test_a_result_over_the_bound_stops_before_the_next_step(self) -> None:
        steps = [step("multiply", 1_000_000, 1_000_000), step("add", "$", 1)]
        with pytest.raises(ValueError, match="RESULT_TOO_LARGE"):
            outcome(steps)

    def test_just_inside_the_bound(self) -> None:
        assert outcome([step("multiply", 1_000, 999)]) == 999_000
