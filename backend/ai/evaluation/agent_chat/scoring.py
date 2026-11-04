import re

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


def correct(outputs: dict, inputs: dict, ground_truth: dict) -> dict:
    """The judge's verdict for a judged case; otherwise every expected figure
    appears."""
    if ground_truth["judge"]:
        verdict = outputs["verdict"]
        return {"score": int(verdict["passed"]), "explanation": verdict["reason"]}
    found = numbers_in(outputs["answer"])
    missing = [
        number
        for number in ground_truth["numbers"]
        if not any(
            matches(number, value, ground_truth["approximate"]) for value in found
        )
        and not (number == 0 and NONE_SAID.search(outputs["answer"].casefold()))
    ]
    return {"score": 0 if missing else 1, "explanation": f"missing: {missing}"}


def tool_choice(outputs: dict, inputs: dict, ground_truth: dict) -> int:
    """A shop question reads the shop's data; any other question reads none.

    `suggest_screen` and `calculate` read nothing, so only `query_shop_data` counts.
    """
    return int(("query_shop_data" in outputs["tools"]) == ground_truth["needs_tool"])


def tool_calls(outputs: dict, inputs: dict, ground_truth: dict) -> int:
    return len(outputs["tools"])


def seconds(outputs: dict, inputs: dict, ground_truth: dict) -> float:
    return outputs["seconds"]


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


# The same patterns as `.honeyhive/evaluators/internal-leak.yaml` and
# `non-vietnamese-answer.yaml`, which score production; those run on HoneyHive and
# cannot import this file, so a change to one belongs in the other.
INTERNALS = re.compile(
    r"ai_read|\bv_[a-z_]+|\bselect\b[\s\S]+\bfrom\b|\b(shop|user)_id\b"
    r"|query_shop_data|suggest_screen|Error\[",
    re.IGNORECASE,
)
CODE_BLOCK = re.compile(r"```.*?```", re.DOTALL)
VIETNAMESE = re.compile(
    r"[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]",
    re.IGNORECASE,
)


def no_internal_leak(outputs: dict, inputs: dict, ground_truth: dict) -> int:
    """1 when the answer shows the owner no view name, SQL, id column, tool name or
    tool error code."""
    return int(not INTERNALS.search(outputs["answer"]))


def vietnamese_answer(outputs: dict, inputs: dict, ground_truth: dict) -> int:
    """1 unless the answer has words but not one Vietnamese letter with a diacritic;
    chart and button blocks are JSON for the app, so they do not count."""
    words = CODE_BLOCK.sub("", outputs["answer"]).strip()
    return int(not words or bool(VIETNAMESE.search(words)))


def numbers_in(answer_text: str) -> list[float]:
    """Each figure in a Vietnamese answer, with unit words applied.

    Dates, times and list markers are dropped first, so the 6 in "tháng 6/2027" or the
    3 in "3. Mì Hảo Hảo" never counts as an answer. "17 triệu 502 nghìn" yields 17
    million, 502 thousand and their sum. Signs are dropped: "giảm 1.715.000" and
    "-1.715.000" state the same change.
    """
    cleaned = re.sub(
        r"\b(ngày|tháng|năm)\s+\d+(/\d+)*"
        r"|\b\d{4}-\d{2}-\d{2}\b"
        r"|\b\d{1,2}/\d{1,2}(/\d{2,4})?\b|\b\d{1,2}/\d{4}\b"
        r"|\b\d{1,2}:\d{2}\b"
        r"|^\s*\d+[.)]\s",
        " ",
        answer_text,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    values = []
    compound = None
    compound_scale = None
    previous_end = None
    for match in re.finditer(
        r"(\d[\d.,]*)\s*(tỷ|triệu|tr\b|m\b|nghìn|ngàn|k\b)?\s*", cleaned, re.IGNORECASE
    ):
        digits, unit = match.groups()
        scale = UNITS[unit.lower()] if unit else None
        value = parse_number(digits.rstrip(".,")) * (scale or 1)
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


def parse_number(digits: str) -> float:
    """Dots and commas group thousands, except a last one followed by one or two
    digits, which is the decimal mark: "149.589,74" and "17.5 triệu" both work."""
    whole, fraction = re.fullmatch(r"(.+?)(?:[.,](\d{1,2}))?", digits).groups()
    number = re.sub(r"[.,]", "", whole)
    return float(f"{number}.{fraction}" if fraction else number)


def matches(expected: float, value: float, approximate: bool) -> bool:
    expected, value = abs(expected), abs(value)
    if approximate:
        return abs(expected - value) <= expected * 0.001
    return expected == value
