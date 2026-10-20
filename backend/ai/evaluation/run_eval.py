"""The eval command: builds one chatbot per model and scores its tool choice."""

import argparse
import asyncio
import sys

import opentelemetry.trace as trace
from opentelemetry.sdk.trace import TracerProvider
from pydantic_ai import Agent
from pydantic_ai.models import Model
from pydantic_ai.models.instrumented import InstrumentationSettings

from evaluation.chatbot_task import ChatbotTask
from evaluation.eval_runner import EvalRunner
from src.agent.guardrails import GuardrailLimits
from src.agent.service import AgentService
from src.app_config import AppConfig, app_config
from src.main import TOOL_CALL_EXEMPT, build_calculation, build_sandbox
from src.providers.factory import build_chat_model
from src.restock.service import RestockService


class EmptyShopData:
    """Stands in for the read-only shop database: every query returns no rows.

    The eval scores which tools the agent picks, not what they return, so it needs no
    database. An empty result is also what the SQL prompt's "retry once" rule reacts to,
    which is why the gate compares distinct tools rather than counting calls.
    """

    def run(self, shop_id: int, sql: str) -> dict:
        return {"columns": [], "rows": [], "truncated": False}


def build_service(chat_model: Model) -> AgentService:
    """Builds the production shop service around `chat_model`, shop data stubbed."""
    # Production runs with the sandbox on, which changes the tool names the model
    # sees, so the eval must too.
    sandbox = build_sandbox()
    if sandbox is None:
        raise SystemExit("The sandbox is off: the eval needs the production tool set.")
    shop_data = EmptyShopData()
    return AgentService(
        chat_model,
        # The eval never calls chat(), so no conversation is read or stored.
        conversations=None,
        guardrail_limits=GuardrailLimits(
            max_input_chars=app_config.AGENT_MAX_INPUT_CHARS,
            model_call_limit=app_config.AGENT_MODEL_CALL_LIMIT,
            tool_call_limit=app_config.AGENT_TOOL_CALL_LIMIT,
            tool_call_exempt=(
                TOOL_CALL_EXEMPT if app_config.CALC_ENABLED else frozenset()
            ),
            turn_token_limit=app_config.AGENT_TURN_TOKEN_LIMIT,
            turn_timeout_seconds=app_config.AGENT_TURN_TIMEOUT_SECONDS,
        ),
        shop_data=shop_data,
        restock=RestockService(shop_data),
        calculation=build_calculation(),
        sandbox=sandbox,
    )


def entry_config(entry: str) -> AppConfig:
    """The settings for one `api:model` entry, with fallbacks dropped.

    A fallback answering for the model under test would hide that model's misses.
    """
    api, _, model_name = entry.partition(":")
    if not model_name:
        raise SystemExit(f"expected api:model, got {entry!r}")
    return app_config.model_copy(
        update={
            "MODEL_PROVIDER": api,
            "MODEL_NAME": model_name,
            "MODEL_FALLBACKS": [],
        }
    )


def build_task(entry: str) -> ChatbotTask:
    """Builds one model's chatbot task from an `api:model` entry."""
    chat_model = build_chat_model(entry_config(entry))
    if chat_model is None:
        raise SystemExit(
            f"Could not build {entry!r}: set OPENAI_API_KEY "
            "(and OPENAI_BASE_URL for anthropic)."
        )
    return ChatbotTask(build_service(chat_model))


def model_entries(raw: str | None) -> list[str]:
    """The `api:model` entries to evaluate; the configured model when none given."""
    entries = [entry.strip() for entry in (raw or "").split(",") if entry.strip()]
    return entries or [f"{app_config.MODEL_PROVIDER}:{app_config.MODEL_NAME}"]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m evaluation",
        description="Scores the shop chatbot's tool choice against cases.yaml.",
    )
    parser.add_argument(
        "--models",
        help=(
            "Comma-separated api:model entries to evaluate, for example "
            "anthropic:claude-haiku-5-5,openai-chat:deepseek-v4.1-flash. "
            "Defaults to the configured MODEL_PROVIDER:MODEL_NAME."
        ),
    )
    return parser.parse_args(argv)


def capture_spans() -> None:
    """Collects the agent's spans in memory, without any message content.

    The graded companion and the budget metrics read the OpenTelemetry span tree, and
    with no tracer provider each one reports a failure instead of failing loudly. CI has
    no Logfire token, so `configure_tracing` stays off there and the eval installs a
    provider itself. This module imports `src.main`, which calls `configure_tracing` on
    import, so on a developer machine with a token the provider is Logfire's own and the
    eval reuses it.

    Content stays off. The metrics read tool names and counts, which are not content, so
    nothing captured here carries the owner's question, the model's SQL or the answer.
    Turning it on would send all three to Logfire and break the promise in
    `src/observability.py`.
    """
    provider = trace.get_tracer_provider()
    if isinstance(provider, trace.ProxyTracerProvider):
        provider = TracerProvider()
        trace.set_tracer_provider(provider)
    Agent.instrument_all(
        InstrumentationSettings(
            tracer_provider=provider,
            include_content=False,
            include_binary_content=False,
        )
    )


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    capture_spans()
    tasks = {entry: build_task(entry) for entry in model_entries(args.models)}
    passed = asyncio.run(EvalRunner(tasks).run())
    sys.exit(0 if passed else 1)
