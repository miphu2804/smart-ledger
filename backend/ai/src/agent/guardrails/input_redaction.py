from pydantic_ai_harness.guardrails import detectors


class InputRedaction:
    """Removes secrets and personal data from the owner's message (NFR-008).

    Uses the Pydantic AI Harness detectors, which name what they removed
    (`[redacted:openai_key]`, `[redacted:credit_card]`). Secrets run first: a card or
    email pattern matching inside a key would break the key apart before the secret
    pattern could remove all of it.
    """

    _DETECTORS = (
        # The Harness has no pattern for a bearer token, so one is added here.
        detectors.secret_data(
            extra={"bearer_token": r"Bearer\s+[A-Za-z0-9._~+/=-]{20,}"}
        ),
        # No `us_ssn`: its 3-2-4 digit shape matches order codes and phone numbers of
        # a Vietnamese shop. A card number must pass the Luhn check, so an order code of
        # the same shape stays.
        detectors.personal_data(only=["iban", "credit_card", "email"]),
    )

    @classmethod
    def redact(cls, text: str) -> str:
        """Return the text with every secret and personal datum replaced."""
        for detector in cls._DETECTORS:
            result = detector(text)
            if result.action == "replace":
                text = result.replacement
        return text
