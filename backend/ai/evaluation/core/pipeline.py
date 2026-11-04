import sys

from evaluation.core.schema import Case, CaseResult


async def run_cases(cases: list[Case], target, score) -> list[CaseResult]:
    """Runs each case through the target and scores its output, one case after
    another, so `seconds` measures the target and not a shared rate limit.

    `target` is entered once for the whole run and called with a case for its output;
    `score` turns a case and its output into metric results. A case that raises is
    logged and left out.
    """
    results = []
    async with target:
        for case in cases:
            try:
                output = await target(case)
                results.append(CaseResult(case, output, await score(case, output)))
            except Exception as error:
                print(f"{case.id} failed: {error!r}", file=sys.stderr)
    return results
