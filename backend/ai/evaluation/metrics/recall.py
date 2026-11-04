from evaluation.core.schema import Case, MetricResult, Output


class RecallEvaluator:
    """Scores one query of the memory evaluation against the memories the service
    returned.

    `recall` is whether the needed memory is among them, `recall_<form>` the same for
    the query's form only, so its mean is that form's share. `top1` is whether it ranks
    first. `stale_only` exists only for a fact with two live versions: 1 when the older
    came back without the newer, so the agent would answer from outdated memory.
    """

    layer = "memory"

    async def evaluate(self, case: Case, output: Output) -> list[MetricResult]:
        found, gold = output.values["recalled"], case.truth["gold"]
        scores = {
            "recall": int(gold in found),
            f"recall_{case.truth['form']}": int(gold in found),
            "top1": int(found[:1] == [gold]),
        }
        stale = case.truth["stale"]
        if stale is not None:
            scores["stale_only"] = int(stale in found and gold not in found)
        return [
            MetricResult(self.layer, name, score, case.id)
            for name, score in scores.items()
        ]
