"""The gating metric: the tools called must be exactly the tools a case expects."""

from dataclasses import dataclass

from pydantic_evals.evaluators import EvaluationReason, Evaluator, EvaluatorContext


@dataclass
class ToolSelectionAccuracy(Evaluator[str, list[str]]):
    """Compares the distinct tools the agent called against the expected ones.

    The library's `ToolCorrectness` compares multisets, so a repeated call reads as a
    mismatch. The SQL prompt tells the model to retry a query that matched nothing or
    errored, and the eval's shop stub returns no rows, so a retry follows the
    instructions. Distinct sets stop that scoring as a miss while still failing a
    missing or an unexpected tool.
    """

    def evaluate(self, ctx: EvaluatorContext[str, list[str]]) -> EvaluationReason:
        expected = set(ctx.expected_output or [])
        called = set(ctx.output or [])
        missing = sorted(expected - called)
        unexpected = sorted(called - expected)
        reasons = []
        if missing:
            reasons.append(f"missing tools: {', '.join(missing)}")
        if unexpected:
            reasons.append(f"unexpected tools: {', '.join(unexpected)}")
        if not reasons:
            return EvaluationReason(value=True)
        return EvaluationReason(value=False, reason="; ".join(reasons))
