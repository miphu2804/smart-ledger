from src.agent.guardrails.guardrail_error import GuardrailError


class InputLengthLimit:
    """Refuses an owner message over the limit before any model call.

    It runs before the run starts rather than as a Pydantic AI `InputGuardrail`, so the
    stream route can still answer `422 input_too_long` before the stream opens.
    """

    def __init__(self, max_chars: int) -> None:
        self.max_chars = max_chars

    def check(self, message: str) -> str:
        """Return the message; raise `GuardrailError("input_too_long")` if too long."""
        if len(message) > self.max_chars:
            raise GuardrailError("input_too_long")
        return message
