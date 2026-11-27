import io
from contextlib import asynccontextmanager

import pytest
from evaluation.agent_chat import target as agent_module
from evaluation.agent_chat.target import AgentTarget
from evaluation.core.render import Table, markdown_table, print_table
from rich.console import Console

from src.app_config import ModelAlias

pytestmark = pytest.mark.anyio

TABLE = Table("Layers", ["metric", "status"], [["correct", "PASS"], ["recall", "FAIL"]])


def test_markdown_table_has_a_heading_a_header_and_one_line_per_row() -> None:
    assert markdown_table(TABLE).splitlines() == [
        "### Layers",
        "",
        "| metric | status |",
        "|---|---|",
        "| correct | PASS |",
        "| recall | FAIL |",
    ]


def test_print_table_writes_plain_text_when_output_is_not_a_terminal() -> None:
    output = io.StringIO()

    print_table(TABLE, Console(file=output))

    assert "\x1b" not in output.getvalue()
    assert "Layers" in output.getvalue()
    assert "PASS" in output.getvalue()


def test_an_unknown_model_alias_names_the_known_ones() -> None:
    with pytest.raises(SystemExit, match="doesnotexist.*chat"):
        AgentTarget(1, 1, {}, "doesnotexist")


async def test_a_known_model_alias_replaces_chat_only_while_the_app_starts(
    monkeypatch,
) -> None:
    aliases = {
        "chat": ModelAlias(protocol="openai_chat", model="original"),
        "fast": ModelAlias(protocol="openai_chat", model="fast-model"),
    }
    monkeypatch.setattr(agent_module.app_config, "MODEL_ALIASES", aliases)
    seen = []

    @asynccontextmanager
    async def fake_lifespan(app):
        seen.append(aliases["chat"].model)
        yield

    monkeypatch.setattr(agent_module, "lifespan", fake_lifespan)
    target = AgentTarget(1, 1, {}, "fast")

    await target._start_app()

    assert seen == ["fast-model"]
    assert aliases["chat"].model == "original"
