import json
import re
from dataclasses import asdict, dataclass
from typing import Literal

from pydantic_ai import RunContext, Tool

from src.prompt_templates import QUERY_RESULT_HEADER, RESTOCK_RESULT_HEADER
from src.restock.service import RestockService
from src.sql.executor import ReadOnlySqlExecutor

# The guard and the executor raise ValueError("CODE: reason") for a query the model can
# fix. Any other ValueError is a bug and must not reach the model.
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


def build_shop_data_tool(executor: ReadOnlySqlExecutor) -> Tool[AgentContext]:
    """Shop-data tool; the executor is injected here, the shop comes per request.

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
            result = executor.run(ctx.deps.shop_id, sql)
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
