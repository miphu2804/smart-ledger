import re

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
