import json

from evaluation.metrics.task import question_of


def tool_choice(outputs: dict, inputs: dict, ground_truth: dict) -> int:
    """A shop question reads the shop's data; any other question reads none.

    `suggest_screen` and `calculate` read nothing, so only `query_shop_data` counts.
    """
    return int(("query_shop_data" in outputs["tools"]) == ground_truth["needs_tool"])


def tool_calls(outputs: dict, inputs: dict, ground_truth: dict) -> int:
    return len(outputs["tools"])


def tool_usage_prompt(outputs: dict, inputs: dict, truth: dict) -> str:
    """Tool Usage."""
    return f"""[Criteria]
1. Tool Selection: Did the assistant choose the most appropriate tool for the task?
2. Tool Usage: Was the tool used correctly and effectively?
3. Necessity: Was the tool usage necessary or could the task be accomplished without it?
4. Integration: How well was the tool output integrated into the response?

[The Start of Available Tools]
{outputs["available_tools"]}
[The End of Available Tools]

[The Start of User Query]
{question_of(inputs)}
[The End of User Query]

[The Start of Assistant's Actions]
{actions_of(outputs)}
[The End of Assistant's Actions]"""


def failure_recovery_prompt(outputs: dict, inputs: dict, truth: dict) -> str | None:
    """Failure Recovery, for a turn where a tool answered with an error."""
    if not any(call["result"].startswith("Error[") for call in outputs["tool_calls"]):
        return None
    return f"""[Criteria]
Failure Recovery: The agent should handle errors gracefully. It should:
- Detect when errors or failures occur
- Implement appropriate recovery strategies
- Avoid cascading failures or error loops
- Provide useful feedback about what went wrong and how it was addressed

[User Input]
{question_of(inputs)}
[End of Input]

[The Start of Agent Response with Error Handling]
{actions_of(outputs)}

Final answer: {outputs["answer"]}
[The End of Agent Response]"""


def tool_trajectory_prompt(outputs: dict, inputs: dict, truth: dict) -> str | None:
    """Tool Trajectory, for a turn that called a tool."""
    if not outputs["tool_calls"]:
        return None
    calls = "\n".join(
        f"- {call['name']}({json.dumps(call['arguments'], ensure_ascii=False)[:200]})"
        for call in outputs["tool_calls"]
    )
    return f"""Evaluate whether the agent called tools in a logical, minimal order to
resolve the user's request. Below are the user's goal and the ordered tool calls.
Rate 1 (wrong or wasteful tool use) to 5 (correct and efficient).

[User goal]
{question_of(inputs)[:400]}

[Tool calls in order]
{calls}"""


def actions_of(outputs: dict) -> str:
    if not outputs["tool_calls"]:
        return "(no tool calls)"
    return json.dumps(outputs["tool_calls"], ensure_ascii=False, indent=1)
