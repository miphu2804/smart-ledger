"""Runs the tool-selection cases against one or more models and judges the pass rate."""

from pathlib import Path

from pydantic_evals import Case, Dataset
from pydantic_evals.evaluators import TrajectoryMatch
from pydantic_evals.reporting import EvaluationReport

from evaluation.chatbot_task import ChatbotTask
from evaluation.tool_selection_accuracy import ToolSelectionAccuracy

CASES_PATH = Path(__file__).with_name("cases.yaml")
# A regression bar, not a correctness claim. This gate runs against a live model, and
# baseline runs scored 19/30 and 16/30 on claude-haiku-5-5, then 21/30 once the gate
# compared distinct tool sets: a single run is noisy to about three cases, so the bar
# sits below all of them. A real regression trips it; noise does not. Raise it as the
# misses recorded in PROGRESS.md are fixed.
PASS_RATE_THRESHOLD = 0.4
# The metric the gate reads: the distinct tools called must be the expected set. Taken
# from the class, so a rename cannot leave the gate reading an assertion that is gone.
TOOL_SELECTION = ToolSelectionAccuracy.__name__
# The cases are independent model calls. Running all 30 at once tripped the gateway's
# rate limit, and a 429 then read as a wrong tool instead of as a request that failed.
MAX_CONCURRENCY = 4


class EvalRunner:
    """Scores each model's chatbot against the ground-truth cases."""

    def __init__(
        self, tasks: dict[str, ChatbotTask], cases_path: Path = CASES_PATH
    ) -> None:
        self._tasks = tasks
        self._cases_path = cases_path

    async def run(self) -> bool:
        """Evaluates every model; returns whether all of them cleared the threshold."""
        dataset = self._dataset()
        passed_all = True
        for label, task in self._tasks.items():
            report = await dataset.evaluate(
                task,
                name=f"bobi-tool-selection-{label}",
                max_concurrency=MAX_CONCURRENCY,
            )
            passed_all &= self._judge(label, report, len(dataset.cases))
        return passed_all

    def _dataset(self) -> Dataset[str, list[str]]:
        """Loads the cases, then adds the tool metrics each one implies."""
        loaded = Dataset[str, list[str]].from_file(self._cases_path)
        return Dataset(
            name=loaded.name,
            cases=[self._with_tool_metrics(case) for case in loaded.cases],
            evaluators=loaded.evaluators,
        )

    @staticmethod
    def _with_tool_metrics(case: Case[str, list[str]]) -> Case[str, list[str]]:
        """Attaches the tool metrics to one case, its expected tools as ground truth.

        `expected_output` stays the single copy of the ground truth; the evaluators are
        built from it rather than repeating the tool list in `cases.yaml`.
        """
        expected = list(case.expected_output or [])
        return Case(
            name=case.name,
            inputs=case.inputs,
            expected_output=case.expected_output,
            evaluators=[
                # The gate: a wrong, missing or unexpected tool fails the case.
                ToolSelectionAccuracy(),
                # Graded companion, so two models that both miss a case can still be
                # told apart by how far off they were.
                TrajectoryMatch(expected_trajectory=expected, order="any_order"),
            ],
        )

    @staticmethod
    def _judge(label: str, report: EvaluationReport, total: int) -> bool:
        """Prints one model's report and returns whether it cleared the threshold."""
        report.print()
        # The summary table has no room for the reason, and the reason names the
        # missing and unexpected tools, which is what a reviewer reads.
        passed = 0
        for case in report.cases:
            result = case.assertions.get(TOOL_SELECTION)
            if result is None:
                continue
            if result.value:
                passed += 1
            else:
                print(f"  miss {case.name}: {result.reason}")
        # A case whose task raised never reaches report.cases, so without this it is
        # counted against the rate but shown nowhere. It is a request that failed, not a
        # tool chosen wrongly, so the summary keeps the count beside the rate.
        for failure in report.failures:
            print(f"  error {failure.name}: {failure.error_message}")
        # Count the task failures against the dataset size instead of letting them
        # drop out of the rate.
        pass_rate = passed / total
        print(
            f"[{label}] {TOOL_SELECTION}: {passed}/{total} passed "
            f"({pass_rate:.0%}), {len(report.failures)} failed to run, "
            f"threshold {PASS_RATE_THRESHOLD:.0%}"
        )
        return pass_rate >= PASS_RATE_THRESHOLD
