import uuid

from evaluation.core.schema import Case, MetricResult, Output
from pydantic import BaseModel, Field
from pydantic_ai import Agent

from src.app_config import app_config
from src.providers.llm_factory import LLMFactory
from src.providers.session_settings import session_settings

RATING_INSTRUCTIONS = (
    "Please act as an impartial judge. Your evaluation should consider the mentioned "
    "criteria. Give a short explanation first, as objectively as possible, then rate "
    "on a scale of 1 to 5."
)
VERDICT_INSTRUCTIONS = (
    "Bạn chấm câu trả lời của một trợ lý cửa hàng theo đúng tiêu "
    "chí được cho. Chỉ xét tiêu chí, không xét văn phong. reason ngắn, bằng "
    "tiếng Việt."
)


class Verdict(BaseModel):
    passed: bool
    reason: str


class Rating(BaseModel):
    reason: str
    score: int = Field(ge=1, le=5)


class Judge:
    """A model that grades answers, built from the app's own model factory.

    Every request names the shop's session, because the gateway rejects one that does
    not, as it does for the app's own runs.
    """

    def __init__(self, alias: str, shop_id: int) -> None:
        self.alias = alias
        self.shop_id = shop_id

    async def check_answer(self, question: str, answer: str, rubric: str) -> dict:
        """Grades an answer against its rubric: `passed` and a `reason`."""
        return await self._grade(
            Verdict,
            VERDICT_INSTRUCTIONS,
            f"Câu hỏi: {question}\n\nTiêu chí: {rubric}\n\nCâu trả lời:\n{answer}",
        )

    async def rate(self, prompt: str) -> dict:
        """Rates 1 to 5 against a prompt adapted from a HoneyHive evaluator template:
        a `score` and a `reason`."""
        return await self._grade(Rating, RATING_INSTRUCTIONS, prompt)

    async def rate_metric(
        self, layer: str, name: str, prompt: str, case: Case, output: Output
    ) -> MetricResult | None:
        """The rating of `prompt` as the metric `name`, with the judge's reason noted in
        the output so a low rating can be read.

        A rating that fails, such as a gateway error, leaves that metric out of the row
        and its error in the output instead of dropping the whole case: one of some 300
        judge calls failing would otherwise fail the run. A gated metric no row scored
        still fails the gate.
        """
        try:
            rating = await self.rate(prompt)
        except Exception as error:
            output.values.setdefault("judge_errors", {})[name] = repr(error)
            return None
        output.values.setdefault("judge_reasons", {})[name] = rating["reason"]
        return MetricResult(layer, name, rating["score"], case.id, rating["reason"])

    async def _grade(self, output_type, instructions: str, prompt: str) -> dict:
        grader = Agent(
            LLMFactory(app_config).create_model(self.alias),
            output_type=output_type,
            instructions=instructions,
        )
        result = await grader.run(
            prompt, model_settings=session_settings(uuid.uuid4().hex, self.shop_id)
        )
        return result.output.model_dump()
