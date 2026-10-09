import re

from pydantic_ai import ModelRetry

from src.sql.guard import SqlGuard

# Internals the answer must never show: the view schema and names, the scope setting
# and its functions, raw tool error codes or a SQL query. The view names come from
# SqlGuard, so a view added there is covered here without a second edit.
_VIEW_NAMES = "|".join(re.escape(view) for view in sorted(SqlGuard.ALLOWED_VIEWS))
LEAK_PATTERN = re.compile(
    rf"{re.escape(SqlGuard.VIEW_SCHEMA)}\.|smartledger\.shop_id|set_config|"
    rf"current_setting|Error\[|\b(?:{_VIEW_NAMES})\b|"
    r"\bselect\b[\s\S]{1,400}?\bfrom\b",
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
