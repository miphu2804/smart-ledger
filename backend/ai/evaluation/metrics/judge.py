import uuid

from evaluation.metrics.memory import context_relevance_prompt
from evaluation.metrics.response_quality import answer_faithfulness_prompt
from evaluation.metrics.tool_use import (
    failure_recovery_prompt,
    tool_trajectory_prompt,
    tool_usage_prompt,
)
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


class Verdict(BaseModel):
    passed: bool
    reason: str


class Rating(BaseModel):
    reason: str
    score: int = Field(ge=1, le=5)


async def judge(
    question: str, answer_text: str, rubric: str, alias: str, shop_id: int
) -> dict:
    """Grades an answer against its rubric with a model from the app's own factory."""
    return await grade(
        alias,
        shop_id,
        Verdict,
        "Bạn chấm câu trả lời của một trợ lý cửa hàng theo đúng tiêu "
        "chí được cho. Chỉ xét tiêu chí, không xét văn phong. reason ngắn, bằng "
        "tiếng Việt.",
        f"Câu hỏi: {question}\n\nTiêu chí: {rubric}\n\nCâu trả lời:\n{answer_text}",
    )


async def rate(prompt: str, alias: str, shop_id: int) -> dict:
    """Rates 1 to 5 against a prompt adapted from a HoneyHive evaluator template."""
    return await grade(alias, shop_id, Rating, RATING_INSTRUCTIONS, prompt)


async def grade(
    alias: str, shop_id: int, output_type, instructions: str, prompt: str
) -> dict:
    grader = Agent(
        LLMFactory(app_config).create_model(alias),
        output_type=output_type,
        instructions=instructions,
    )
    result = await grader.run(
        prompt,
        # The gateway rejects a request that names no session, as the app's runs do.
        model_settings=session_settings(uuid.uuid4().hex, shop_id),
    )
    return result.output.model_dump()


# The prompts are HoneyHive's evaluator templates (docs.honeyhive.ai, "Evaluator
# Templates"), with each field they read mapped to the case's outputs; each lives with
# the layer it rates. A builder returns None when the template does not apply to the
# case.
JUDGED = {
    "tool_usage": tool_usage_prompt,
    "failure_recovery": failure_recovery_prompt,
    "answer_faithfulness": answer_faithfulness_prompt,
    "context_relevance": context_relevance_prompt,
    "tool_trajectory": tool_trajectory_prompt,
}


async def judged_scores(outputs: dict, inputs: dict, truth: dict, rate_prompt) -> dict:
    """Each template's rating for the cases it applies to, with the judge's reason in
    the outputs so a low rating can be read.

    A rating that fails, such as a gateway error, leaves that metric out of the row and
    its error in the outputs instead of dropping the whole case: one of some 300 judge
    calls failing would otherwise fail the run. A gated metric no row scored still fails
    the gate.
    """
    scores = {}
    for name, build in JUDGED.items():
        prompt = build(outputs, inputs, truth)
        if prompt is None:
            continue
        try:
            rating = await rate_prompt(prompt)
        except Exception as error:
            outputs.setdefault("judge_errors", {})[name] = repr(error)
            continue
        scores[name] = rating["score"]
        outputs.setdefault("judge_reasons", {})[name] = rating["reason"]
    return scores
