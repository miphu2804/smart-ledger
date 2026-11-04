from evaluation.core.schema import Case, MetricResult, Output


class PerformanceEvaluator:
    layer = "performance"

    async def evaluate(self, case: Case, output: Output) -> list[MetricResult]:
        return [MetricResult(self.layer, "seconds", output.values["seconds"], case.id)]
