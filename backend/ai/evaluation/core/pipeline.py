from evaluation.core.schema import Case, CaseResult
from rich.progress import (
    MofNCompleteColumn,
    Progress,
    TextColumn,
    TimeElapsedColumn,
)


async def run_evaluation(evaluation) -> list[CaseResult]:
    """Runs an evaluation: each case through its target, then through its evaluators.

    An evaluation is any object with `cases`, a `target` and `evaluators`; see
    `AgentChatEval` and `MemoryEval`. The cases run one after another, so `seconds`
    measures the target and not a shared rate limit. A case that raises is logged and
    left out. The target is entered once for the whole run.
    """
    results = []
    columns = (
        TextColumn("case"),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        TextColumn("{task.fields[case_id]}"),
    )
    # The bar redraws in place on a terminal and prints once elsewhere; failures go
    # through its console so they do not break the line.
    with Progress(*columns) as progress:
        task = progress.add_task("", total=len(evaluation.cases), case_id="")
        async with evaluation.target:
            for case in evaluation.cases:
                progress.update(task, case_id=case.id)
                try:
                    results.append(await _run_case(evaluation, case))
                except Exception as error:
                    progress.console.print(f"{case.id} failed: {error!r}")
                progress.advance(task)
    return results


async def _run_case(evaluation, case: Case) -> CaseResult:
    output = await evaluation.target.ask(case)
    metrics = []
    for evaluator in evaluation.evaluators:
        metrics += await evaluator.evaluate(case, output)
    return CaseResult(case, output, metrics)
