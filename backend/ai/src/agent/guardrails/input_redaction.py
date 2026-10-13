import re

# Sixteen digits in groups of four; only numbers that pass the Luhn check are masked.
CARD_PATTERN = re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b")

# Secrets an owner might paste by mistake: OpenAI-style keys, bearer tokens and JWTs.
SECRET_PATTERN = re.compile(
    r"sk-[A-Za-z0-9_-]{20,}"
    r"|Bearer\s+[A-Za-z0-9._~+/=-]{20,}"
    r"|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"
)
SECRET_REPLACEMENT = "[REDACTED_API_KEY]"


def redact_input(text: str) -> str:
    """Return the owner's message with card numbers masked and secrets redacted."""
    masked = CARD_PATTERN.sub(_mask_card, text)
    return SECRET_PATTERN.sub(SECRET_REPLACEMENT, masked)


def _mask_card(match: re.Match[str]) -> str:
    """Keep the last four digits of a card number, in the owner's grouping."""
    number = match.group()
    digits = [int(character) for character in number if character.isdigit()]
    if not _passes_luhn(digits):
        return number
    last_four = "".join(str(digit) for digit in digits[-4:])
    separator = "-" if "-" in number else " " if " " in number else ""
    return separator.join(["****", "****", "****", last_four])


def _passes_luhn(digits: list[int]) -> bool:
    checksum = 0
    for index, digit in enumerate(reversed(digits)):
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        checksum += digit
    return checksum % 10 == 0
