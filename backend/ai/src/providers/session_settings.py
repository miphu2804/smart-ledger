from pydantic_ai.settings import ModelSettings

# OpenCode Go asks each client to name itself rather than send the SDK's User-Agent.
USER_AGENT = "smartledger-ai/0.1.0"


def session_settings(session_id: str, shop_id: int) -> ModelSettings:
    """Per-run model settings naming the gateway session of one conversation.

    OpenCode Go rejects a request without `x-opencode-session` and routes and caches
    prompts by it. Bifrost keeps its own session header, groups its logs by
    `x-bf-session-id`, stores `x-bf-lh-*` as log metadata, and forwards `x-bf-eh-*`
    upstream without the prefix, so a run through Bifrost needs both forms of each
    header. The User-Agent travels in the same `extra_headers`, because a run's
    settings replace the model's `extra_headers` whole. Other gateways ignore the
    `x-bf-*` headers.
    """
    return ModelSettings(
        extra_headers={
            "User-Agent": USER_AGENT,
            "x-opencode-session": session_id,
            "x-bf-eh-user-agent": USER_AGENT,
            "x-bf-eh-x-opencode-session": session_id,
            "x-bf-session-id": session_id,
            "x-bf-lh-shop-id": str(shop_id),
        }
    )
