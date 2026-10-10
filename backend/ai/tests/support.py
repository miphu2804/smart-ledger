"""Shared data for the AI tests."""

import json
import re
from collections.abc import AsyncIterator
from pathlib import Path

import psycopg
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models.function import (
    AgentInfo,
    DeltaToolCall,
    DeltaToolCalls,
    FunctionModel,
)
from sqlalchemy.engine import make_url

from src.agent.guardrails import GuardrailLimits

# Guardrails stay enabled in tests; these limits are wide enough not to change any case
# that does not target them. Guardrail tests pass their own small limits instead.
TEST_GUARDRAIL_LIMITS = GuardrailLimits(
    max_input_chars=100_000,
    model_call_limit=100,
    tool_call_limit=100,
    turn_token_limit=10_000_000,
    turn_timeout_seconds=60,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
CORE_MIGRATIONS = REPO_ROOT / "backend/core/src/main/resources/db/migration"
# The Core tables the AI baseline reads (users, shops, catalog and sales).
CORE_MIGRATION_FILES = [
    "V1__create_auth_and_shops.sql",
    "V2__add_shop_archive.sql",
    "V3__add_shop_inactive_reason.sql",
    "V4__create_catalog_and_paid_sales.sql",
]
AI_BASELINE = REPO_ROOT / "supabase/migrations/20261005000000_ai_baseline.sql"


def apply_core_migrations(connection: psycopg.Connection) -> None:
    for name in CORE_MIGRATION_FILES:
        connection.execute((CORE_MIGRATIONS / name).read_text(), prepare=False)


def apply_ai_baseline(connection: psycopg.Connection, view_schema: str) -> None:
    # The views go to a per-test schema so parallel runs and a developer's real
    # `ai_read` schema are never touched; the role name is shared across the cluster.
    text = re.sub(r"\bai_read\b", view_schema, AI_BASELINE.read_text())
    connection.execute(text, prepare=False)


def schema_url(database_url: str, schema: str) -> str:
    """`database_url` with `schema` first on the search path, for `PostgreDBClient`.

    `POSTGRES_TEST_URL` must be a `postgresql://` URL for this, not a libpq keyword
    string.
    """
    url = make_url(database_url).update_query_dict(
        {"options": f"-c search_path={schema}"}
    )
    return url.render_as_string(hide_password=False)


class ScriptedModel(FunctionModel):
    """A model that replays `responses` in order and records each request it gets.

    A `str` response is a text answer; `tool_call` builds a tool-call response. A
    streamed request replays the same responses in chunks.
    """

    def __init__(self, *responses: str | ModelResponse) -> None:
        super().__init__(
            self._respond, stream_function=self._stream, model_name="test-model"
        )
        self.responses = list(responses)
        self.requests: list[tuple[list[ModelMessage], AgentInfo]] = []

    def _respond(self, messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        response = self._take(messages, info)
        if isinstance(response, str):
            return ModelResponse(parts=[TextPart(response)])
        return response

    async def _stream(
        self, messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        response = self._take(messages, info)
        if isinstance(response, str):
            response = ModelResponse(parts=[TextPart(response)])
        for part in response.parts:
            if isinstance(part, TextPart):
                # Word by word, so a leak arrives split across chunks.
                for chunk in re.findall(r"\S+\s*|\s+", part.content):
                    yield chunk
        calls = [part for part in response.parts if isinstance(part, ToolCallPart)]
        if calls:
            yield {
                index: DeltaToolCall(
                    name=call.tool_name,
                    json_args=json.dumps(call.args),
                    tool_call_id=call.tool_call_id,
                )
                for index, call in enumerate(calls)
            }

    def _take(
        self, messages: list[ModelMessage], info: AgentInfo
    ) -> str | ModelResponse:
        self.requests.append((list(messages), info))
        if not self.responses:
            raise AssertionError("unexpected model request")
        return self.responses.pop(0)

    def tool_names(self, request: int = 0) -> list[str]:
        """Names of the tools the model was offered on that request."""
        return [tool.name for tool in self.requests[request][1].function_tools]


def tool_call(name: str, args: dict, *more: dict) -> ModelResponse:
    """A model response calling `name` with `args`, plus a parallel call per `more`."""
    return ModelResponse(parts=[ToolCallPart(name, call) for call in (args, *more)])


def transcript(messages: list[ModelMessage]) -> list[tuple[str, str]]:
    """The messages as (kind, text) pairs, in the order the model read them."""
    pairs = []
    for message in messages:
        for part in message.parts:
            if isinstance(part, UserPromptPart):
                pairs.append(("user", part.content))
            elif isinstance(part, TextPart):
                pairs.append(("assistant", part.content))
            elif isinstance(part, ToolCallPart):
                pairs.append(("call", part.tool_name))
            elif isinstance(part, ToolReturnPart):
                pairs.append(("tool", part.model_response_str()))
            elif isinstance(part, RetryPromptPart):
                pairs.append(("retry", part.model_response()))
    return pairs


def tool_results(model: ScriptedModel) -> list[str]:
    """What the tools returned, as the model read it on its last request."""
    return [text for kind, text in transcript(model.requests[-1][0]) if kind == "tool"]


def echo_user_prompts(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    """A model function that answers with every user prompt it was sent, in order."""
    prompts = [
        part.content
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, UserPromptPart)
    ]
    return ModelResponse(parts=[TextPart(" | ".join(prompts))])
