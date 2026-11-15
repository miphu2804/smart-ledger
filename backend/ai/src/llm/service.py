from pydantic_ai.models import Model

from src.llm.model_router import LLMRouterService, ModelSelection


class LLMService:
    """The chat models of the agent: the default model and, when tiering is on, the
    tier router that picks each turn's model.

    A turn without a selection runs on the default model, so callers never ask
    whether tiering is on to name the model or to keep a tier.
    """

    def __init__(
        self, model: Model | None, router: LLMRouterService | None = None
    ) -> None:
        self.model = model
        self.router = router

    @property
    def tiered(self) -> bool:
        """Whether each turn gets a tier model instead of the default model."""
        return self.router is not None

    async def select(
        self, conversation_id: int | None, user_messages: list[str]
    ) -> ModelSelection | None:
        """The tier model of this turn, or None to run on the default model."""
        if self.router is None:
            return None
        return await self.router.route(conversation_id, user_messages)

    def model_name(self, selection: ModelSelection | None = None) -> str:
        """The name of the model a turn with this selection runs on."""
        if selection is not None:
            return selection.model.model_name
        return self.model.model_name if self.model is not None else ""

    def remember(self, conversation_id: int, selection: ModelSelection | None) -> None:
        """Keep the turn's tier for the conversation's later turns."""
        if selection is not None and self.router is not None:
            self.router.remember(conversation_id, selection)
