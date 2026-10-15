import re

from pydantic_ai_harness import GuardrailResult

from src.sql.guard import SqlGuard


class AnswerScreen:
    """Keeps empty answers and leaked internals away from the owner, in a whole or a
    streamed answer.

    `check` is a Pydantic AI Harness output guard that sends an empty or leaking answer
    back to the model. The Harness checks only the final output, so `screened_prefix`
    holds back streamed text that could still become a leak.
    """

    # Internals the answer must never show: the view schema and names, the scope
    # setting and its functions, raw tool error codes or a SQL query. The view names
    # come from SqlGuard, so a view added there is covered here without a second edit.
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
    # A partial answer is held while one of these literals could still complete. The
    # extra character lets `\b` see past the end of a view name.
    _HOLD_CHARS = max(len(literal) for literal in (*_LITERAL_LEAKS, *_VIEW_NAMES)) + 1
    _VIEW_ALTERNATIVES = "|".join(re.escape(view) for view in _VIEW_NAMES)
    LEAK_PATTERN = re.compile(
        "|".join(re.escape(literal) for literal in _LITERAL_LEAKS)
        + rf"|\b(?:{_VIEW_ALTERNATIVES})\b"
        + rf"|\bselect\b[\s\S]{{1,{_SELECT_SPAN}}}?\bfrom\b",
        re.IGNORECASE,
    )
    EMPTY_RETRY = "The answer was empty. Answer the owner's question."
    LEAK_RETRY = (
        "Rewrite the answer in plain words for the shop owner, without SQL, view "
        "names, settings or error codes."
    )

    @classmethod
    def check(cls, answer: str) -> GuardrailResult:
        """Allow a non-empty answer with no leak; ask the model again otherwise."""
        if not answer.strip():
            return GuardrailResult.retry(cls.EMPTY_RETRY)
        if cls.LEAK_PATTERN.search(answer):
            return GuardrailResult.retry(cls.LEAK_RETRY)
        return GuardrailResult.allow()

    @classmethod
    def screened_prefix(cls, text: str) -> str:
        """Return the longest prefix of a partial answer that no continuation can turn
        into a leak. `check` still screens the whole answer before it is stored."""
        # A complete leak ends the release at its start; a partial one holds the tail.
        leak = cls.LEAK_PATTERN.search(text)
        cut = leak.start() if leak is not None else len(text) - cls._HOLD_CHARS
        # A select within reach of its `from` may still complete a match, so it and
        # everything after it wait, even when a later leak already matches. The +1
        # covers the `\b` after `from`.
        pending_selects = [
            match.start()
            for match in cls._SELECT_WORD.finditer(text)
            if len(text) - match.end() <= cls._SELECT_SPAN + len("from") + 1
        ]
        return text[: max(0, min([cut, *pending_selects]))]
