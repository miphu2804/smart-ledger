"""The calculate tool: what the model receives for a valid plan and a rejected one."""

import json

from src.agent.tools import build_calculation_tool
from src.calculation.ops import CalculationStep
from src.calculation.service import CalculationLimits, CalculationService
from src.prompt_templates import CALC_RESULT_HEADER

LIMITS = CalculationLimits(max_operations=5, max_operand=1_000_000)
CALC = CalculationService(LIMITS)


def calculate(operations: list[dict]) -> str:
    """Call the raw tool function the way Pydantic AI would after validating args."""
    return build_calculation_tool(CALC).function(
        operations=[CalculationStep.model_validate(op) for op in operations]
    )


def test_valid_plan_returns_the_header_result_and_trail() -> None:
    answer = calculate(
        [
            {"op": "percentage", "a": 10, "b": 60000},
            {"op": "subtract", "a": "$", "b": 5000},
        ]
    )

    assert answer.startswith(f"{CALC_RESULT_HEADER}\n")
    payload = json.loads(answer.removeprefix(f"{CALC_RESULT_HEADER}\n"))
    assert payload["result"] == 1000
    assert [(s["op"], s["result"]) for s in payload["steps"]] == [
        ("percentage", 6000.0),
        ("subtract", 1000.0),
    ]


def test_a_rejected_plan_returns_an_error_code_the_model_can_fix() -> None:
    answer = calculate([{"op": "divide", "a": 1, "b": 0}])

    assert answer.startswith("Error[DIVISION_BY_ZERO]")
    assert "Fix the steps and retry." in answer
