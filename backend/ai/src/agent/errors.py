"""Errors the agent feature raises; `main.py` and the router map each to a response."""


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
