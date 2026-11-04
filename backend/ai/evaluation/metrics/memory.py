import json

from evaluation.core.schema import Case, MetricResult, Output
from evaluation.metrics.judge import Judge
from evaluation.metrics.utils import get_question


class MemoryEvaluator:
    layer = "memory"

    def __init__(self, judge: Judge) -> None:
        self.judge = judge

    async def evaluate(self, case: Case, output: Output) -> list[MetricResult]:
        """Both metrics need a case that can only be answered from a memory; any other
        case gets no result."""
        if case.truth["memory"] is None:
            return []
        recalled = MetricResult(
            self.layer, "recalled_expected", self._score_recalled(case, output), case.id
        )
        relevance = await self.judge.rate_metric(
            self.layer,
            "context_relevance",
            self._build_relevance_prompt(case, output),
            case,
            output,
        )
        return [recalled] + ([relevance] if relevance else [])

    @staticmethod
    def _score_recalled(case: Case, output: Output) -> int:
        """Whether the recall returned the fact the case can only be answered from."""
        return int(
            any(
                memory["content"] == case.truth["memory"]
                for memory in output.values["memories"]
            )
        )

    @staticmethod
    def _build_relevance_prompt(case: Case, output: Output) -> str:
        """Context Relevance, of the memories recalled."""
        retrieved = json.dumps(output.values["memories"], ensure_ascii=False)
        return f"""[Criteria]
The context fetched by the retriever should be relevant to the user's initial query.

[The Start of User's Query]
{get_question(case)}
[The End of User's Query]

[The Start of Retriever's Context]
{retrieved}
[The End of Retriever's Context]"""
