import re

from evaluation.core.schema import Case, MetricResult, Output
from evaluation.metrics.judge import Judge
from evaluation.metrics.utils import question_of

UNITS = {
    "tỷ": 1_000_000_000,
    "triệu": 1_000_000,
    "tr": 1_000_000,
    "m": 1_000_000,
    "nghìn": 1000,
    "ngàn": 1000,
    "k": 1000,
}
# "chưa có đơn nào" answers a question whose expected figure is zero.
NONE_SAID = re.compile(r"(chưa|không)\s+(có|bán|phát sinh|ghi nhận)")
# Dates, times and list markers, which are not figures of an answer.
NOT_FIGURES = re.compile(
    r"\b(ngày|tháng|năm)\s+\d+(/\d+)*"
    r"|\b\d{4}-\d{2}-\d{2}\b"
    r"|\b\d{1,2}/\d{1,2}(/\d{2,4})?\b|\b\d{1,2}/\d{4}\b"
    r"|\b\d{1,2}:\d{2}\b"
    r"|^\s*\d+[.)]\s",
    re.IGNORECASE | re.MULTILINE,
)
FIGURE = re.compile(
    r"(\d[\d.,]*)\s*(tỷ|triệu|tr\b|m\b|nghìn|ngàn|k\b)?\s*", re.IGNORECASE
)


class TaskEvaluator:
    """`correct`: whether the answer says what the case expects."""

    layer = "task"

    def __init__(self, judge: Judge) -> None:
        self.judge = judge

    async def evaluate(self, case: Case, output: Output) -> list[MetricResult]:
        """A judged case is graded by the judge against its rubric, which also leaves
        its verdict in the output; any other case needs every expected figure."""
        if case.truth["judge"]:
            verdict = await self.judge.verdict(
                question_of(case), output.values["answer"], case.truth["judge"]
            )
            output.values["verdict"] = verdict
            score, explanation = int(verdict["passed"]), verdict["reason"]
        else:
            missing = self._missing_figures(case, output.values["answer"])
            score, explanation = (0 if missing else 1), f"missing: {missing}"
        return [MetricResult(self.layer, "correct", score, case.id, explanation)]

    @classmethod
    def _missing_figures(cls, case: Case, answer: str) -> list[float]:
        found = cls._numbers_in(answer)
        approximate = case.truth["approximate"]
        return [
            number
            for number in case.truth["numbers"]
            if not any(cls._matches(number, value, approximate) for value in found)
            and not (number == 0 and NONE_SAID.search(answer.casefold()))
        ]

    @classmethod
    def _numbers_in(cls, answer: str) -> list[float]:
        """Each figure in a Vietnamese answer, with unit words applied.

        Dates, times and list markers are dropped first, so the 6 in "tháng 6/2027" or
        the 3 in "3. Mì Hảo Hảo" never counts as an answer. "17 triệu 502 nghìn"
        yields 17 million, 502 thousand and their sum. Signs are dropped: "giảm
        1.715.000" and "-1.715.000" state the same change.
        """
        cleaned = NOT_FIGURES.sub(" ", answer)
        values = []
        compound = None
        compound_scale = None
        previous_end = None
        for match in FIGURE.finditer(cleaned):
            digits, unit = match.groups()
            scale = UNITS[unit.lower()] if unit else None
            value = cls._parse_number(digits.rstrip(".,")) * (scale or 1)
            values.append(value)
            # "17 triệu 502 nghìn": a smaller unit right after a larger one adds to it.
            if scale and compound is not None and scale < compound_scale:
                if match.start() == previous_end:
                    compound += value
                    values.append(compound)
                else:
                    compound = value
            else:
                compound = value if scale else None
            compound_scale = scale
            previous_end = match.end()
        return values

    @staticmethod
    def _parse_number(digits: str) -> float:
        """Dots and commas group thousands, except a last one followed by one or two
        digits, which is the decimal mark: "149.589,74" and "17.5 triệu" both work."""
        whole, fraction = re.fullmatch(r"(.+?)(?:[.,](\d{1,2}))?", digits).groups()
        number = re.sub(r"[.,]", "", whole)
        return float(f"{number}.{fraction}" if fraction else number)

    @staticmethod
    def _matches(expected: float, value: float, approximate: bool) -> bool:
        expected, value = abs(expected), abs(value)
        if approximate:
            return abs(expected - value) <= expected * 0.001
        return expected == value
