import httpx

from src.agent.model_tier import Tier
from src.prompt_templates import TIER_CLASSIFIER_PROMPT, TIER_DESCRIPTIONS


class JevTierClassifier:
    """Rates a chat request with TypeSafe Jev through Bifrost's `/v1/decisions`.

    Bifrost holds the TypeSafe key; `client` carries the AI service's virtual key and
    is owned by the composition root.
    """

    def __init__(self, client: httpx.AsyncClient, url: str, model: str) -> None:
        self.client = client
        self.url = url
        self.model = model

    async def classify(self, user_messages: list[str]) -> Tier:
        """The tier of the last message; raises when Jev gives no valid answer."""
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
                        "instructions": TIER_CLASSIFIER_PROMPT,
                        "choices": [
                            {
                                "value": tier.name,
                                "description": TIER_DESCRIPTIONS[tier.name],
                            }
                            for tier in Tier
                        ],
                    }
                ],
            },
        )
        response.raise_for_status()
        # A refused question has no `choice`; that and an unknown value raise here.
        return Tier[response.json()["answers"][0]["choice"]]
