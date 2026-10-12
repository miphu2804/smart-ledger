from pydantic_ai_harness.guardrails import detectors


class SecretRedaction:
    """Redacts API keys, tokens, JWTs and private keys an owner pastes by mistake.

    Uses the Pydantic AI Harness secret detector, which names what it removed
    (`[redacted:openai_key]`). The detector has no pattern for a bearer token, so one
    is added here.
    """

    _DETECTOR = detectors.secret_data(
        extra={"bearer_token": r"Bearer\s+[A-Za-z0-9._~+/=-]{20,}"}
    )

    @classmethod
    def redact(cls, text: str) -> str:
        """Return the text with every secret replaced by its placeholder."""
        result = cls._DETECTOR(text)
        return result.replacement if result.action == "replace" else text
