"""Errors the agent feature raises, and the one table from an error to its failure code.

A live error and a replayed failed turn must answer with the same status, so the
statuses `main.py` gives these errors and the ones `failure_status` gives a stored
code are declared here once.
"""

CONVERSATION_NOT_FOUND_STATUS = 404
GUARDRAIL_STATUS = 422
# The codes `GuardrailService` raises; a stored code outside this set replays as 503.
GUARDRAIL_CODES = frozenset({"input_too_long", "answer_unavailable", "answer_timeout"})


class ConversationNotFoundError(Exception):
    """The conversation is missing or belongs to another owner or shop (404)."""


class TurnProtocolError(Exception):
    """Safe protocol code, without question, answer or database diagnostics."""

    def __init__(self, code: str, status: int):
        super().__init__(code)
        self.code = code
        self.status = status


class GuardrailError(Exception):
    """A guardrail stopped the turn; `code` is the stable code the app maps to text."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


# Errors whose code may reach the caller; any other error is hidden as ai_unavailable.
SAFE_ERRORS = (GuardrailError, ConversationNotFoundError, TurnProtocolError)


def failure_code(error: Exception) -> str:
    """Return the code a failed turn records and a failed stream sends."""
    if isinstance(error, (GuardrailError, TurnProtocolError)):
        return error.code
    if isinstance(error, ConversationNotFoundError):
        return "conversation_not_found"
    return "ai_unavailable"


def failure_status(code: str) -> int:
    """Return the status a replay of a turn that FAILED with `code` answers with."""
    if code == "conversation_not_found":
        return CONVERSATION_NOT_FOUND_STATUS
    if code in GUARDRAIL_CODES:
        return GUARDRAIL_STATUS
    return 503
