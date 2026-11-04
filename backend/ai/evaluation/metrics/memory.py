import json

from evaluation.metrics.task import question_of


def recalled_expected(outputs: dict, inputs: dict, ground_truth: dict) -> int | None:
    """Whether the recall returned the fact the case can only be answered from; None
    for a case that needs no memory."""
    if ground_truth["memory"] is None:
        return None
    return int(
        any(
            memory["content"] == ground_truth["memory"]
            for memory in outputs["memories"]
        )
    )


def context_relevance_prompt(outputs: dict, inputs: dict, truth: dict) -> str | None:
    """Context Relevance, of the memories recalled, for a case that needs one."""
    if truth["memory"] is None:
        return None
    retrieved = json.dumps(outputs["memories"], ensure_ascii=False)
    return f"""[Criteria]
The context fetched by the retriever should be relevant to the user's initial query.

[The Start of User's Query]
{question_of(inputs)}
[The End of User's Query]

[The Start of Retriever's Context]
{retrieved}
[The End of Retriever's Context]"""


def recall_scores(outputs: dict, inputs: dict, truth: dict) -> dict[str, int]:
    """Scores one query of the memory suite against the memories the service returned.

    `recall` is whether the needed memory is among them, `recall_<form>` the same for
    the query's form only, so its mean is that form's share. `top1` is whether it
    ranks first. `stale_only` exists only for a fact with two live versions: 1 when
    the older came back without the newer, so the agent would answer from outdated
    memory.
    """
    found, gold = outputs["recalled"], truth["gold"]
    scores = {
        "recall": int(gold in found),
        f"recall_{truth['form']}": int(gold in found),
        "top1": int(found[:1] == [gold]),
    }
    if truth["stale"] is not None:
        scores["stale_only"] = int(truth["stale"] in found and gold not in found)
    return scores
