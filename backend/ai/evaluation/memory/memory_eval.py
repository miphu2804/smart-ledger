import json
from pathlib import Path

from evaluation.core.schema import Case
from evaluation.metrics.recall import RecallEvaluator
from evaluation.targets.memory import MemoryTarget

DIRECTORY = Path(__file__).parent


class MemoryEval:
    """Recall of `AgentMemoryService` on the frozen shops of `cases.jsonl`: each shop's
    memories and the queries that need one.

    Each query runs once and no model grades it, so it takes no options.
    """

    name = "memory"
    thresholds = DIRECTORY / "thresholds.toml"
    summary = ()

    def __init__(self) -> None:
        self.shops = [
            json.loads(line)
            for line in (DIRECTORY / "cases.jsonl").read_text().splitlines()
        ]
        self.cases = self._build_cases()
        self.target = MemoryTarget(self.shops, DIRECTORY / "cache")
        self.evaluators = [RecallEvaluator()]

    def check(self) -> None:
        """Nothing to check: no expected value here depends on the date."""

    def show_plan(self, name: str) -> None:
        print(f"{len(self.cases)} queries over {len(self.shops)} shops")

    def _build_cases(self) -> list[Case]:
        """One case per query. The memory ids in `truth` are positions in the shop."""
        return [
            Case(
                f"{shop['shop']}/{number}",
                {"shop": shop["shop"], "query": query["text"]},
                {"gold": query["gold"], "form": query["form"], "stale": query["stale"]},
                expected=[query["gold"]],
            )
            for shop in self.shops
            for number, query in enumerate(shop["queries"])
        ]
