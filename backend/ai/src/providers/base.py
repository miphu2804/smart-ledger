from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderResult:
    text: str
    model: str
    model_version: str
