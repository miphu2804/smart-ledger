"""The eval harness on a scripted model: the cases, the metrics and the span capture.

No model is called, so this runs in CI beside the rest of the suite. The dataset here is
a throwaway file, not `cases.yaml`: the real cases need a live model.
"""

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic_ai import Agent
from pydantic_ai.models.instrumented import InstrumentationSettings
from pydantic_evals import Case, Dataset
from pydantic_evals.evaluators import MaxToolCalls
from tests.support import ScriptedModel, tool_call, transcript

from evaluation.chatbot_task import ChatbotTask
from evaluation.eval_runner import EvalRunner
from evaluation.run_eval import (
    build_service,
    capture_spans,
    entry_config,
    model_entries,
)
from src.app_config import app_config

pytestmark = pytest.mark.anyio

DATA_CASES = """\
name: probe
cases:
  - name: data_question
    inputs: "Hôm nay shop bán được bao nhiêu tiền?"
    expected_output: [query_shop_data]
"""

QUESTION = "Hôm nay shop bán được bao nhiêu tiền?"
SQL = "SELECT sum(total) FROM orders"
ANSWER = "Shop bán được 0 đồng."


def cases_file(tmp_path, text: str):
    path = tmp_path / "cases.yaml"
    path.write_text(text, encoding="utf-8")
    return path


def rate_cases(count: int) -> str:
    """`count` identical cases, so only the pass rate varies between datasets."""
    cases = "".join(
        f'  - name: case_{index}\n    inputs: "q{index}"\n'
        f"    expected_output: [query_shop_data]\n"
        for index in range(count)
    )
    return f"name: probe\ncases:\n{cases}"


def task(*responses) -> ChatbotTask:
    return ChatbotTask(build_service(ScriptedModel(*responses)))


class Answers:
    """Answers the first `passing` questions and raises on the rest.

    A bare task, not a chatbot: these cases vary only the pass rate, so no model is
    needed.
    """

    def __init__(self, passing: int) -> None:
        self._passing = passing

    async def __call__(self, question: str) -> list[str]:
        if int(question.removeprefix("q")) < self._passing:
            return ["query_shop_data"]
        raise RuntimeError("model unavailable")


async def test_the_task_sends_the_current_time_as_a_chat_turn_does() -> None:
    # The shop prompt tells the model every owner message ends with the time line, so a
    # case asking about "hôm nay" must carry it, as production does.
    model = ScriptedModel("Shop bán được 0 đồng.")

    await ChatbotTask(build_service(model))(QUESTION)

    assert [kind for kind, _ in transcript(model.requests[0][0])] == ["user", "time"]


async def test_a_case_that_calls_the_expected_tool_passes(tmp_path) -> None:
    chat = task(
        tool_call("query_shop_data", {"sql": "SELECT 1"}), "Shop bán được 0 đồng."
    )
    runner = EvalRunner({"test": chat}, cases_path=cases_file(tmp_path, DATA_CASES))

    assert await runner.run() is True


async def test_a_case_that_calls_the_wrong_tool_fails(tmp_path) -> None:
    # The tool it did call, so a task that raised instead cannot pass this off as a
    # wrong-tool result.
    direct = task(tool_call("calculate", {"operations": []}), "Shop bán được 0 đồng.")
    assert await direct(QUESTION) == ["calculate"]

    chat = task(tool_call("calculate", {"operations": []}), "Shop bán được 0 đồng.")
    runner = EvalRunner({"test": chat}, cases_path=cases_file(tmp_path, DATA_CASES))

    assert await runner.run() is False


async def test_a_repeated_tool_call_still_passes(tmp_path) -> None:
    # The SQL prompt tells the model to retry a query that matched nothing, and the
    # eval's shop stub returns no rows, so calling one tool twice is the prompt followed
    # rather than a tool chosen wrongly.
    chat = task(
        tool_call("query_shop_data", {"sql": "SELECT 1"}),
        tool_call("query_shop_data", {"sql": "SELECT 2"}),
        "Shop bán được 0 đồng.",
    )
    runner = EvalRunner({"test": chat}, cases_path=cases_file(tmp_path, DATA_CASES))

    assert await runner.run() is True


async def test_the_budget_metrics_read_the_captured_spans() -> None:
    # With no tracer provider these report a failure instead of raising, so a passing
    # budget is the guard that the eval installs one.
    capture_spans()
    chat = task(tool_call("query_shop_data", {"sql": "SELECT 1"}), "Shop bán 0 đồng.")
    dataset = Dataset(
        name="probe",
        cases=[Case(name="c", inputs=QUESTION, expected_output=["query_shop_data"])],
        evaluators=[MaxToolCalls(max_calls=4)],
    )

    report = await dataset.evaluate(chat, progress=False)

    assert report.cases[0].assertions["MaxToolCalls"].value is True


async def test_the_captured_spans_carry_no_message_content() -> None:
    # NFR-008: the traces must never carry the owner's question, the model's SQL or the
    # answer. `include_content` is read off the real capture, so turning it on there
    # fails here rather than passing quietly.
    captured = {}
    original = Agent.instrument_all

    def spy(settings) -> None:
        captured["settings"] = settings
        original(settings)

    Agent.instrument_all = spy
    try:
        capture_spans()
    finally:
        Agent.instrument_all = original

    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    settings = captured["settings"]
    Agent.instrument_all(
        InstrumentationSettings(
            tracer_provider=provider,
            include_content=settings.include_content,
            include_binary_content=settings.include_binary_content,
        )
    )

    chat = task(tool_call("query_shop_data", {"sql": SQL}), ANSWER)
    await chat(QUESTION)

    spans = exporter.get_finished_spans()
    assert spans, "the eval captured no spans"
    # The metrics read the tool name, which is not content, so this must survive.
    assert any(
        (span.attributes or {}).get("gen_ai.tool.name") == "query_shop_data"
        for span in spans
    )
    dump = repr([(span.name, dict(span.attributes or {})) for span in spans])
    for secret in (QUESTION, SQL, ANSWER):
        assert secret not in dump


async def test_a_case_whose_task_raises_is_counted_against_the_rate(tmp_path) -> None:
    class Exploding:
        """Stands in for a run the model call broke."""

        async def __call__(self, question: str) -> list[str]:
            raise RuntimeError("model unavailable")

    runner = EvalRunner(
        {"test": Exploding()}, cases_path=cases_file(tmp_path, DATA_CASES)
    )

    assert await runner.run() is False


async def test_the_threshold_is_inclusive(tmp_path) -> None:
    # 2 of 5 is exactly the threshold, so this passes only while the comparison is `>=`.
    runner = EvalRunner(
        {"test": Answers(2)}, cases_path=cases_file(tmp_path, rate_cases(5))
    )

    assert await runner.run() is True


async def test_a_task_that_raises_stays_in_the_denominator(tmp_path) -> None:
    # 2 of 7 is below the threshold, but 2 of the 2 cases that produced a result is not,
    # so this fails only while the denominator is the dataset size.
    runner = EvalRunner(
        {"test": Answers(2)}, cases_path=cases_file(tmp_path, rate_cases(7))
    )

    assert await runner.run() is False


@pytest.mark.parametrize("raw", [None, "", "  "])
def test_a_blank_models_flag_falls_back_to_the_configured_model(raw) -> None:
    # The workflow always passes --models, with an empty value when the input is blank.
    assert model_entries(raw) == [
        f"{app_config.MODEL_PROVIDER}:{app_config.MODEL_NAME}"
    ]


def test_the_models_flag_splits_on_commas_and_drops_blanks() -> None:
    assert model_entries(" anthropic:a , , openai-chat:b ") == [
        "anthropic:a",
        "openai-chat:b",
    ]


def test_a_model_entry_splits_the_api_from_the_model_name() -> None:
    config = entry_config("openai-chat:mercury-3")

    assert (config.MODEL_PROVIDER, config.MODEL_NAME) == ("openai-chat", "mercury-3")


def test_a_model_entry_drops_the_configured_fallbacks(monkeypatch) -> None:
    # A fallback answering for the model under test would hide that model's misses.
    monkeypatch.setattr(app_config, "MODEL_FALLBACKS", ["anthropic:other"])

    assert entry_config("anthropic:claude-haiku-5-5").MODEL_FALLBACKS == []


def test_a_model_entry_without_an_api_is_rejected() -> None:
    with pytest.raises(SystemExit):
        entry_config("claude-haiku-5-5")
