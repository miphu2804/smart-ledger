from pydantic_ai_harness.guardrails import detectors


class PersonalDataRedaction:
    """Redacts card numbers, emails, IBANs and US SSNs in the owner's message (NFR-008).

    Uses the Pydantic AI Harness personal-data detector with its defaults: a card
    number must pass the Luhn check, so an order code of the same shape stays.
    """

    _DETECTOR = detectors.personal_data()

    @classmethod
    def redact(cls, text: str) -> str:
        """Return the text with personal data replaced by its placeholder."""
        result = cls._DETECTOR(text)
        return result.replacement if result.action == "replace" else text
