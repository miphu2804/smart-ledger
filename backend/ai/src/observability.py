import asyncio
import logging
import uuid
from collections.abc import Coroutine

from honeyhive import HoneyHiveTracer
from pydantic_ai import Agent
from pydantic_ai.models.instrumented import InstrumentationSettings

from src.app_config import AppConfig

logger = logging.getLogger(__name__)


class Observability:
    """HoneyHive traces for the AI service; without a tracer every call is a no-op.

    Traces keep timing, token counts, model and tool names, errors and the run's
    `shop_id`, never the owner's question, the answer, tool arguments or tool results:
    those can hold customer names and phone numbers (NFR-008). A bare
    `Agent.instrument_all()` would turn that content on.
    """

    def __init__(self, tracer: HoneyHiveTracer | None = None) -> None:
        self._tracer = tracer
        # Held so a call to HoneyHive is not garbage collected mid-run.
        self._background: set[asyncio.Task] = set()

    @classmethod
    def start(cls, config: AppConfig) -> "Observability":
        """Instrument every agent when a key is set; otherwise leave traces off."""
        api_key = config.HH_API_KEY
        if api_key is None or not api_key.strip():
            logger.info("honeyhive unconfigured; traces off")
            return cls()
        tracer = HoneyHiveTracer.init(
            api_key=api_key,
            project=config.HH_PROJECT,
            source=config.HH_SOURCE,
            server_url=config.HH_API_URL,
            # Each chat turn opens its own session; one at startup would stay empty.
            skip_backend_session_creation=True,
        )
        Agent.instrument_all(
            InstrumentationSettings(
                tracer_provider=tracer.provider,
                include_content=False,
                include_binary_content=False,
            )
        )
        logger.info("honeyhive traces on (%s)", config.HH_SOURCE)
        return cls(tracer)

    async def start_turn_session(
        self, shop_id: int, conversation_id: int | None
    ) -> None:
        """Group this turn's spans; ids only, so no message is traced (NFR-008)."""
        if self._tracer is None:
            return
        session_id = str(uuid.uuid4())
        # No request here: HoneyHive keeps spans under an id it has not seen, so the
        # owner never waits on it and a slow HoneyHive costs only the session metadata.
        await self._tracer.acreate_session(
            session_name="agent-chat", session_id=session_id, skip_api_call=True
        )
        # Sent now, not after the turn: once a span lands first, HoneyHive has already
        # made the session and this metadata is dropped.
        self._run_in_background(
            self._tracer.acreate_session(
                session_name="agent-chat",
                session_id=session_id,
                metadata={"shop_id": shop_id, "conversation_id": conversation_id},
            )
        )

    def link_conversation(self, conversation_id: int) -> None:
        """Tag this turn's session with the conversation its save just created."""
        if self._tracer is None:
            return
        self._run_in_background(
            asyncio.to_thread(
                self._tracer.enrich_session,
                metadata={"conversation_id": conversation_id},
            )
        )

    def _run_in_background(self, call: Coroutine) -> None:
        task = asyncio.create_task(call)
        self._background.add(task)
        task.add_done_callback(self._background.discard)
