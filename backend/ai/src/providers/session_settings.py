from pydantic_ai.settings import ModelSettings


def session_settings(session_id: str, shop_id: int) -> ModelSettings:
    """Per-run model settings naming the gateway session of one conversation.

    Bifrost groups its logs by `x-bf-session-id` and stores `x-bf-lh-*` as log
    metadata. A run's settings replace the model's `extra_headers` whole, so the
    virtual key header lives on the client instead (src/providers/).
    """
    return ModelSettings(
        extra_headers={
            "x-bf-session-id": session_id,
            "x-bf-lh-shop-id": str(shop_id),
        }
    )
