import json
import re
from dataclasses import asdict, dataclass
from typing import Literal

from pydantic_ai import RunContext, Tool, ToolReturn

from src.calculation.ops import CalculationStep
from src.calculation.service import CalculationService
from src.prompt_templates import (
    CALC_RESULT_HEADER,
    QUERY_RESULT_HEADER,
    RESTOCK_RESULT_HEADER,
)
from src.restock.service import RestockService
from src.sql.repository import ShopDataRepository

# The guard and the repository raise ValueError("CODE: reason") for a query the model
# can fix. Any other ValueError is a bug and must not reach the model.
MODEL_ERROR = re.compile(r"([A-Z][A-Z_]*): (.*)", re.DOTALL)


def _model_error(error: ValueError) -> str:
    """Return `Error[CODE]: reason.` for a fixable error, re-raise anything else."""
    match = MODEL_ERROR.fullmatch(str(error))
    if match is None:
        raise error
    code, reason = match.groups()
    return f"Error[{code}]: {reason}."


@dataclass(frozen=True)
class AgentContext:
    """Scope of one chat request, injected into tools instead of chosen by the model."""

    user_id: int
    shop_id: int


# App screens a reply can link to; the mobile app maps each to its route and label.
Screen = Literal[
    "sales", "voice_order", "orders", "products", "debts", "expenses", "reports"
]


def suggest_screen(screen: Screen) -> ToolReturn:
    """Add a button under the reply that opens this app screen."""
    # The screen travels as metadata, which the model never reads back; the service
    # turns it into the button after the run, so no model text reaches the button.
    return ToolReturn(
        return_value=f"Button to {screen} added.", metadata={"screen": screen}
    )


def build_shop_data_tool(shop_data: ShopDataRepository) -> Tool[AgentContext]:
    """Shop-data tool; the repository is injected here, the shop comes per request.

    `ctx` is filled by Pydantic AI from the run's deps and is not part of the schema
    sent to the model, which forbids extra arguments, so the model only supplies `sql`
    and cannot pick a shop.
    """

    def query_shop_data(ctx: RunContext[AgentContext], sql: str) -> str:
        """Run one read-only SELECT on the shop's views. Returns JSON or Error[CODE]."""
        # A rejected or failed query goes back to the model as text so it can rewrite
        # the query. Anything else, such as an unreachable reader database, propagates
        # and the router answers 503 ai_unavailable.
        try:
            result = shop_data.run(ctx.deps.shop_id, sql)
        except ValueError as error:
            return f"{_model_error(error)} Rewrite the query and retry."
        payload = {
            "columns": result["columns"],
            "rows": result["rows"],
            "row_count": len(result["rows"]),
            "truncated": result["truncated"],
        }
        return f"{QUERY_RESULT_HEADER}\n{json.dumps(payload, ensure_ascii=False)}"

    return Tool(query_shop_data, takes_ctx=True)


def build_restock_tool(restock: RestockService) -> Tool[AgentContext]:
    """Restock tool; the service is injected here, the shop comes per request.

    `period` is a closed set and `ctx` is filled by Pydantic AI, so the model cannot
    pick a shop or a free-form window.
    """

    def suggest_restock(
        ctx: RunContext[AgentContext],
        period: Literal["last_7_days", "last_30_days"],
    ) -> str:
        """Suggest what to restock from confirmed sales. Returns JSON or Error[CODE]."""
        # A failed query goes back to the model as text, like query_shop_data.
        try:
            result = restock.suggest(ctx.deps.shop_id, period)
        except ValueError as error:
            return (
                f"{_model_error(error)} Tell the owner the suggestion is unavailable."
            )
        payload = {
            "period": result.period,
            "days": result.days,
            "truncated": result.truncated,
            "suggestions": [asdict(suggestion) for suggestion in result.suggestions],
        }
        return f"{RESTOCK_RESULT_HEADER}\n{json.dumps(payload, ensure_ascii=False)}"

    return Tool(suggest_restock, takes_ctx=True)


def build_calculation_tool(calc: CalculationService) -> Tool[AgentContext]:
    """Arithmetic tool; the service is injected here, so the plan limits live in it.

    The steps are a Pydantic model list, so the model sees the op enum and the `$`
    placeholder in the schema and cannot pass an unknown op.
    """

    def calculate(operations: list[CalculationStep]) -> str:
        """Compute a chain of arithmetic steps. Returns JSON or Error[CODE]."""
        # A rejected plan goes back to the model as text so it can fix the steps,
        # like query_shop_data. Nothing else can raise here: the service is pure.
        try:
            outcome = calc.calculate(operations)
        except ValueError as error:
            return f"{_model_error(error)} Fix the steps and retry."
        payload = {
            # Rounded to 6 places, so 0.1 + 0.2 reads as 0.3; the trail stays raw
            # as the audit of what was computed.
            "result": round(outcome.result, 6),
            "steps": [
                {
                    "op": trace.op.value,
                    "a": trace.a,
                    "b": trace.b,
                    "result": trace.result,
                }
                for trace in outcome.steps
            ],
        }
        return f"{CALC_RESULT_HEADER}\n{json.dumps(payload, ensure_ascii=False)}"

    return Tool(calculate)
