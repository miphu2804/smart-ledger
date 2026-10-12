class GuardrailError(Exception):
    """A guardrail stopped the turn; `code` is the stable code the app maps to text."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code
