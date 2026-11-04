import sys

from evaluation.core.schema import Case, CaseResult


class EvaluationPipeline:
    """Runs an evaluation: each case through its target, then through its evaluators.

    An evaluation is any object with `cases`, a `target` and `evaluators`; see
    `AgentChatEval` and `MemoryEval`.
    """

    async def run(self, evaluation) -> list[CaseResult]:
        """Runs the cases one after another, so `seconds` measures the target and not a
        shared rate limit. A case that raises is logged and left out.

        The target is entered once for the whole run.
        """
        results = []
        async with evaluation.target:
            for case in evaluation.cases:
                try:
                    results.append(await self._run_case(evaluation, case))
                except Exception as error:
                    print(f"{case.id} failed: {error!r}", file=sys.stderr)
        return results

    async def _run_case(self, evaluation, case: Case) -> CaseResult:
        output = await evaluation.target.ask(case)
        metrics = []
        for evaluator in evaluation.evaluators:
            metrics += await evaluator.evaluate(case, output)
        return CaseResult(case, output, metrics)
