import logging

import logfire

from src.app_config import AppConfig

logger = logging.getLogger(__name__)

SERVICE_NAME = "smart-ledger-ai"


def configure_tracing(config: AppConfig) -> bool:
    """Send Pydantic AI traces to Logfire when a token is set; return whether it did.

    Traces keep timing, token counts, model and tool names, errors and the run's
    `shop_id`. `LOGFIRE_INCLUDE_CONTENT` adds the owner's question, the answer, tool
    arguments and tool results as they are, phone numbers included: Logfire never
    scrubs those message attributes (NFR-008).
    """
    token = config.LOGFIRE_TOKEN
    if token is None or not token.strip():
        logger.info("logfire unconfigured; traces off")
        return False
    logfire.configure(
        token=token,
        service_name=SERVICE_NAME,
        environment=config.LOGFIRE_ENVIRONMENT,
        # stdout stays the log contract; Logfire only receives the spans.
        console=False,
        # Spans only: Logfire's own metrics are not needed to debug a turn.
        metrics=False,
    )
    logfire.instrument_pydantic_ai(
        include_content=config.LOGFIRE_INCLUDE_CONTENT, include_binary_content=False
    )
    logger.info(
        "logfire traces on (%s, content %s)",
        config.LOGFIRE_ENVIRONMENT or "no environment",
        "on" if config.LOGFIRE_INCLUDE_CONTENT else "off",
    )
    return True
