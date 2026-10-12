from pydantic_ai_harness import GuardrailResult


class EmptyAnswerCheck:
    """Sends an empty answer back to the model to answer the owner's question."""

    RETRY = "The answer was empty. Answer the owner's question."

    @classmethod
    def check(cls, answer: str) -> GuardrailResult:
        """Allow a non-empty answer; ask the model again for an empty one."""
        if not answer.strip():
            return GuardrailResult.retry(cls.RETRY)
        return GuardrailResult.allow()
