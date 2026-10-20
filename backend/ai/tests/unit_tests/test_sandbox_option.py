"""The sandbox option: the wrapper, its injection into the agent, and what the model
sees when it is on or off. Independent of the calculation service: each option is
injected on its own. With the production tool list the read-only data tools stay
native, so only model-written code runs in the sandbox."""

import pytest
from pydantic_ai.messages import ModelResponse, ToolCallPart, ToolReturnPart
from tests.support import TEST_GUARDRAIL_LIMITS, ScriptedModel

from src.agent.service import AgentService
from src.calculation.service import CalculationLimits, CalculationService
from src.main import SANDBOX_TOOLS
from src.prompt_templates import (
    CALC_PROMPT,
    RUN_CODE_PROMPT,
    SQL_AGENT_PROMPT,
)
from src.sandbox.wrapper import Sandbox, SandboxLimits

pytestmark = pytest.mark.anyio

LIMITS = SandboxLimits(
    tools=SANDBOX_TOOLS,
    max_memory_bytes=64 * 1024 * 1024,
    max_duration_secs=5.0,
    max_tool_calls=10,
    max_suspensions=100,
)


class FakeShopData:
    def run(self, shop_id: int, sql: str) -> dict:
        return {
            "columns": ["selling_price_vnd"],
            "rows": [[10000], [20000]],
            "truncated": False,
        }


class FakeConversations:
    def recent_messages(self, conversation_id, user_id, shop_id, limit):
        return []

    def save_exchange(self, **kwargs):
        return kwargs["conversation_id"] or 41, 72


def service(model, **kwargs) -> AgentService:
    return AgentService(model, FakeConversations(), **kwargs)


def run_code_call(code: str) -> ModelResponse:
    return ModelResponse(parts=[ToolCallPart("run_code", {"code": code})])


async def chat(model, **kwargs) -> str:
    agent = service(
        model,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
        shop_data=FakeShopData(),
        **kwargs,
    )
    return (await agent.chat(user_id=3, shop_id=15, message="compute")).answer


async def test_agent_offers_run_code_and_keeps_the_data_tools_native() -> None:
    model = ScriptedModel("ok")
    await chat(model, sandbox=Sandbox(LIMITS))

    names = model.tool_names(0)
    assert "run_code" in names
    # The read-only data tool is not folded, so calling it never starts Monty.
    assert "query_shop_data" in names


async def test_a_read_only_data_question_never_enters_the_sandbox() -> None:
    model = ScriptedModel(
        ModelResponse(
            parts=[ToolCallPart("query_shop_data", {"sql": "SELECT selling_price_vnd"})]
        ),
        "Revenue is 30000.",
    )
    assert await chat(model, sandbox=Sandbox(LIMITS)) == "Revenue is 30000."
    # The call ran as a native tool: its result came straight back, not a retry for
    # an unknown tool, and the model never had to write run_code.
    returns = [
        part
        for message in model.requests[1][0]
        for part in getattr(message, "parts", [])
        if isinstance(part, ToolReturnPart)
    ]
    assert [part.tool_name for part in returns] == ["query_shop_data"]
    assert "20000" in returns[0].content


async def test_agent_without_the_sandbox_keeps_the_data_tools_native() -> None:
    model = ScriptedModel("ok")
    await chat(model)

    names = model.tool_names(0)
    assert "run_code" not in names
    assert "query_shop_data" in names


async def test_the_calculation_and_sandbox_options_are_independent() -> None:
    model = ScriptedModel("ok")
    await chat(model, sandbox=Sandbox(LIMITS))

    names = model.tool_names(0)
    assert "run_code" in names
    assert "calculate" not in names
    assert CALC_PROMPT not in model.requests[0][1].instructions


async def test_the_sandbox_prompt_names_the_run_code_path() -> None:
    model = ScriptedModel("ok")
    await chat(model, sandbox=Sandbox(LIMITS))

    instructions = model.requests[0][1].instructions
    # The data tools stay native, so the direct-call SQL prompt stays too.
    assert RUN_CODE_PROMPT in instructions
    assert SQL_AGENT_PROMPT in instructions


async def test_without_the_sandbox_the_sql_prompt_names_the_direct_tool() -> None:
    model = ScriptedModel("ok")
    await chat(model)

    instructions = model.requests[0][1].instructions
    assert SQL_AGENT_PROMPT in instructions
    # No run_code guidance for a tool that is not registered.
    assert RUN_CODE_PROMPT not in instructions


async def test_agent_with_calculation_adds_the_tool_and_prompt() -> None:
    model = ScriptedModel("ok")
    calculation = CalculationService(
        CalculationLimits(max_operations=5, max_operand=1_000_000)
    )
    await chat(model, calculation=calculation)

    assert "calculate" in model.tool_names(0)
    assert CALC_PROMPT in model.requests[0][1].instructions


async def test_model_written_code_still_runs_in_the_sandbox() -> None:
    code = "prices = [10000, 20000]\nsum(p * 2 for p in prices)"
    model = ScriptedModel(run_code_call(code), "The doubled revenue is 60000.")

    assert await chat(model, sandbox=Sandbox(LIMITS)) == "The doubled revenue is 60000."


async def test_an_allocation_over_the_memory_limit_is_a_retry_not_a_failure() -> None:
    # 100 million ints need about 800 MB, far past the 64 MB heap; Monty stops the
    # snippet and Code Mode returns the error to the model to retry.
    code = "x = [0] * (100 * 1024 * 1024)\nx"
    model = ScriptedModel(
        run_code_call(code),
        "That computation needs more memory than I can use here.",
    )

    assert await chat(model, sandbox=Sandbox(LIMITS)) == (
        "That computation needs more memory than I can use here."
    )


async def test_a_turn_without_run_code_never_touches_the_sandbox() -> None:
    # A plain answer with no run_code call is the whole point of the option: the
    # sandbox starts only when the model writes code.
    model = ScriptedModel("plain answer")

    assert await chat(model, sandbox=Sandbox(LIMITS)) == "plain answer"
