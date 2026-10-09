import re

from pydantic_ai import ModelRetry

from src.sql.guard import SqlGuard

# Internals the answer must never show: the view schema and names, the scope setting
# and its functions, raw tool error codes or a SQL query. The view names come from
# SqlGuard, so a view added there is covered here without a second edit.
_VIEW_NAMES = sorted(SqlGuard.ALLOWED_VIEWS)
_LITERAL_LEAKS = (
    f"{SqlGuard.VIEW_SCHEMA}.",
    "smartledger.shop_id",
    "set_config",
    "current_setting",
    "Error[",
)
_SELECT_SPAN = 400
_SELECT_WORD = re.compile(r"\bselect\b", re.IGNORECASE)
# A partial answer is held while one of these literals could still complete. The extra
# character lets `\b` see past the end of a view name.
_HOLD_CHARS = max(len(literal) for literal in (*_LITERAL_LEAKS, *_VIEW_NAMES)) + 1
_VIEW_ALTERNATIVES = "|".join(re.escape(view) for view in _VIEW_NAMES)
LEAK_PATTERN = re.compile(
    "|".join(re.escape(literal) for literal in _LITERAL_LEAKS)
    + rf"|\b(?:{_VIEW_ALTERNATIVES})\b|\bselect\b[\s\S]{{1,{_SELECT_SPAN}}}?\bfrom\b",
    re.IGNORECASE,
)
EMPTY_ANSWER_RETRY = "The answer was empty. Answer the owner's question."
LEAK_RETRY = (
    "Rewrite the answer in plain words for the shop owner, without SQL, view names, "
    "settings or error codes."
)


def screen_answer(answer: str) -> str:
    """Return the answer the owner may see; ask the model again for an empty or
    leaking one."""
    if not answer.strip():
        raise ModelRetry(EMPTY_ANSWER_RETRY)
    if LEAK_PATTERN.search(answer):
        raise ModelRetry(LEAK_RETRY)
    return answer


def screened_prefix(text: str) -> str:
    """Return the longest prefix of a partial answer that no continuation can turn into
    a leak. `screen_answer` still checks the whole answer before it is stored."""
    leak = LEAK_PATTERN.search(text)
    if leak is not None:
        return text[: leak.start()]
    # A select within reach of its `from` may still complete a match, so it and
    # everything after it wait. The +1 covers the `\b` after `from`.
    pending_selects = [
        match.start()
        for match in _SELECT_WORD.finditer(text)
        if len(text) - match.end() <= _SELECT_SPAN + len("from") + 1
    ]
    cut = min([len(text) - _HOLD_CHARS, *pending_selects])
    return text[: max(0, cut)]
