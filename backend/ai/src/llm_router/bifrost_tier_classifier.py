import httpx

from src.llm_router.tier import Tier
from src.observability import Observability


class BifrostTierClassifier:
    """Rates a request with a decision model through Bifrost's `/v1/decisions`.

    The model, such as `typesafe/jev-latest`, is whichever decision model Bifrost
    serves; Bifrost holds its provider key. `client` carries the caller's virtual key
    and is owned by the composition root. `instructions` and `descriptions` (keyed by
    `Tier` name) are the caller's domain wording of the one `choice` question asked.
    The call is plain HTTP, so it records its own model span with the token counts
    Bifrost reports; the money stays in Bifrost's log, which prices the call.
    """

    def __init__(
        self,
        client: httpx.AsyncClient,
        url: str,
        model: str,
        instructions: str,
        descriptions: dict[str, str],
        observability: Observability,
    ) -> None:
        self.client = client
        self.url = url
        self.model = model
        self.instructions = instructions
        self.descriptions = descriptions
        self.observability = observability

    async def classify(self, user_messages: list[str]) -> Tier:
        """The tier of the last message; raises when the model gives no valid answer."""
        with self.observability.span(
            "tier classifier", event_type="model", config={"model": self.model}
        ):
            body = await self._decide(user_messages)
            self.observability.enrich_span(metadata=body.get("usage") or {})
        # A refused question has no `choice`; that and an unknown value raise here.
        return Tier[body["answers"][0]["choice"]]

    async def _decide(self, user_messages: list[str]) -> dict:
        response = await self.client.post(
            self.url,
            json={
                "model": self.model,
                "input": [
                    {"role": "user", "content": message} for message in user_messages
                ],
                "questions": [
                    {
                        "type": "choice",
                        "name": "tier",
                        "instructions": self.instructions,
                        "choices": [
                            {
                                "value": tier.name,
                                "description": self.descriptions[tier.name],
                            }
                            for tier in Tier
                        ],
                    }
                ],
            },
        )
        response.raise_for_status()
        return response.json()
