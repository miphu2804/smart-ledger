"""Errors the agent feature raises; `main.py` and the router map each to a response."""


class ConversationNotFoundError(Exception):
    """The conversation is missing or belongs to another owner or shop (404)."""


class GuardrailError(Exception):
    """A guardrail stopped the turn; `code` is the stable code the app maps to text."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code
