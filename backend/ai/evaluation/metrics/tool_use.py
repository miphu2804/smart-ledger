import json

from evaluation.core.schema import Case, MetricResult, Output
from evaluation.metrics.judge import Judge
from evaluation.metrics.utils import get_question

TRAJECTORY_PROMPT = """\
Evaluate whether the agent called tools in a logical, minimal order to
resolve the user's request. Below are the user's goal and the ordered tool calls.
Rate 1 (wrong or wasteful tool use) to 5 (correct and efficient).

[User goal]
{goal}

[Tool calls in order]
{calls}"""


class ToolUseEvaluator:
    """How the agent used its tools: two counts, and three ratings by the judge."""

    layer = "tool_use"

    def __init__(self, judge: Judge) -> None:
        self.judge = judge

    async def evaluate(self, case: Case, output: Output) -> list[MetricResult]:
        metrics = [
            MetricResult(
                self.layer, "tool_choice", self._score_choice(case, output), case.id
            ),
            MetricResult(
                self.layer, "tool_calls", len(output.values["tools"]), case.id
            ),
        ]
        # The prompts are HoneyHive's evaluator templates (docs.honeyhive.ai,
        # "Evaluator Templates"), with each field they read mapped to the case's
        # outputs. A template that does not apply to the case has no prompt.
        prompts = {
            "tool_usage": self._build_usage_prompt(case, output),
            "failure_recovery": self._build_recovery_prompt(case, output),
            "tool_trajectory": self._build_trajectory_prompt(case, output),
        }
        for name, prompt in prompts.items():
            if prompt is not None:
                rated = await self.judge.rate_metric(
                    self.layer, name, prompt, case, output
                )
                if rated:
                    metrics.append(rated)
        return metrics

    @staticmethod
    def _score_choice(case: Case, output: Output) -> int:
        """A shop question reads the shop's data; any other question reads none.

        `calculate` reads nothing, so only `query_shop_data` counts.
        """
        used = "query_shop_data" in output.values["tools"]
        return int(used == case.truth["needs_tool"])

    @classmethod
    def _build_usage_prompt(cls, case: Case, output: Output) -> str:
        """Tool Usage."""
        return f"""[Criteria]
1. Tool Selection: Did the assistant choose the most appropriate tool for the task?
2. Tool Usage: Was the tool used correctly and effectively?
3. Necessity: Was the tool usage necessary or could the task be accomplished without it?
4. Integration: How well was the tool output integrated into the response?

[The Start of Available Tools]
{output.values["available_tools"]}
[The End of Available Tools]

[The Start of User Query]
{get_question(case)}
[The End of User Query]

[The Start of Assistant's Actions]
{cls._format_actions(output)}
[The End of Assistant's Actions]"""

    @classmethod
    def _build_recovery_prompt(cls, case: Case, output: Output) -> str | None:
        """Failure Recovery, for a turn where a tool answered with an error."""
        calls = output.values["tool_calls"]
        if not any(call["result"].startswith("Error[") for call in calls):
            return None
        return f"""[Criteria]
Failure Recovery: The agent should handle errors gracefully. It should:
- Detect when errors or failures occur
- Implement appropriate recovery strategies
- Avoid cascading failures or error loops
- Provide useful feedback about what went wrong and how it was addressed

[User Input]
{get_question(case)}
[End of Input]

[The Start of Agent Response with Error Handling]
{cls._format_actions(output)}

Final answer: {output.values["answer"]}
[The End of Agent Response]"""

    @staticmethod
    def _build_trajectory_prompt(case: Case, output: Output) -> str | None:
        """Tool Trajectory, for a turn that called a tool."""
        if not output.values["tool_calls"]:
            return None
        calls = "\n".join(
            f"- {call['name']}({ToolUseEvaluator._format_arguments(call)})"
            for call in output.values["tool_calls"]
        )
        return TRAJECTORY_PROMPT.format(goal=get_question(case)[:400], calls=calls)

    @staticmethod
    def _format_arguments(call: dict) -> str:
        return json.dumps(call["arguments"], ensure_ascii=False)[:200]

    @staticmethod
    def _format_actions(output: Output) -> str:
        if not output.values["tool_calls"]:
            return "(no tool calls)"
        return json.dumps(output.values["tool_calls"], ensure_ascii=False, indent=1)
