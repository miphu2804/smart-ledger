import asyncio
import contextvars
import functools
import logging
import random
import uuid
from collections.abc import Coroutine, Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from contextvars import ContextVar

from honeyhive import HoneyHiveTracer
from pydantic_ai import Agent, Embedder
from pydantic_ai.models.instrumented import InstrumentationSettings
from pydantic_ai.usage import RunUsage

from src.app_config import AppConfig

logger = logging.getLogger(__name__)
# The task creating this turn's session on HoneyHive, so the turn's updates wait for it;
# None for a turn left out of the sample, which then sends nothing.
_session_created: ContextVar[asyncio.Task | None] = ContextVar(
    "session_created", default=None
)


class Observability:
    """HoneyHive traces for the AI service; without a tracer every call is a no-op.

    Traces keep timing, token counts, model and tool names, errors and the run's
    `shop_id`, plus the prompts, the redacted question, tool arguments, tool results and
    the answer. That content can hold customer names and phone numbers, so HoneyHive is
    part of the approved data flow (NFR-008). Raw media stays out, and a pasted key is
    gone before the session opens because `InputRedaction` runs first.

    Each chat turn is one HoneyHive session: it opens with the redacted question, the
    owner, the model and the prompt version, and closes with the answer and the turn's
    token use, so the session list reads like the chat and filters by any of them. A
    turn that fails, times out or is cancelled gets `metadata.error` instead.
    """

    # An update waits this long for its session to exist; the flush waits longer, so a
    # restart does not cut off an update still waiting.
    SESSION_WAIT_SECONDS = 5

    def __init__(
        self,
        tracer: HoneyHiveTracer | None = None,
        sample_rate: float = 1.0,
        git_sha: str | None = None,
    ) -> None:
        self._tracer = tracer
        self._sample_rate = sample_rate
        self._git_sha = git_sha
        # Held so a call to HoneyHive is not garbage collected mid-run.
        self._background: set[asyncio.Task] = set()
        # The SDK updates a session with a blocking HTTP call; its own threads keep a
        # slow HoneyHive from holding the default pool the database calls run on.
        self._threads = ThreadPoolExecutor(
            max_workers=2, thread_name_prefix="honeyhive"
        )

    @classmethod
    def start(cls, config: AppConfig) -> "Observability":
        """Instrument every agent when a key is set; otherwise leave traces off."""
        api_key = config.HH_API_KEY
        if api_key is None or not api_key.strip():
            logger.info("honeyhive unconfigured; traces off")
            return cls()
        tracer = HoneyHiveTracer.init(
            api_key=api_key,
            source=config.HH_SOURCE,
            server_url=config.HH_API_URL,
            # Each chat turn opens its own session; one at startup would stay empty.
            skip_backend_session_creation=True,
        )
        # The SDK warns for each span it drops for having no session, which every turn
        # left out of the sample and every draft does by design.
        logging.getLogger("honeyhive.early_init").addFilter(
            lambda record: "has no session_id" not in record.getMessage()
        )
        settings = InstrumentationSettings(
            tracer_provider=tracer.provider,
            include_content=True,
            include_binary_content=False,
        )
        Agent.instrument_all(settings)
        # Memory recall and writes embed text; without this their time is missing.
        Embedder.instrument_all(settings)
        logger.info(
            "honeyhive traces on (%s, %.0f%% of turns)",
            config.HH_SOURCE,
            100 * config.HH_SAMPLE_RATE,
        )
        return cls(tracer, config.HH_SAMPLE_RATE, config.GIT_SHA or None)

    async def start_turn_session(
        self,
        shop_id: int,
        user_id: int,
        conversation_id: int | None,
        question: str,
        versions: dict[str, str],
    ) -> None:
        """Group this turn's spans under a new session that opens with the question."""
        if self._tracer is None:
            return
        if random.random() >= self._sample_rate:
            # No session id in the context, so the SDK drops this turn's spans; the free
            # plan counts every span and session update against its monthly events.
            _session_created.set(None)
            return
        session_id = str(uuid.uuid4())
        # No request here: HoneyHive keeps spans under an id it has not seen, so the
        # owner never waits on it and a slow HoneyHive costs only the session fields.
        await self._tracer.acreate_session(
            session_name="agent-chat", session_id=session_id, skip_api_call=True
        )
        # Sent now, not after the turn: once a span lands first, HoneyHive has already
        # made the session and these fields are dropped.
        created = self._run_in_background(
            self._create_session(
                session_id,
                inputs={"question": question},
                # The SDK takes no session config, so the model and prompt version
                # ride in the metadata, where the session list can filter them.
                metadata={
                    "shop_id": shop_id,
                    "conversation_id": conversation_id,
                    **versions,
                    "git_sha": self._git_sha,
                },
                user_properties={"user_id": user_id},
            )
        )
        _session_created.set(created)

    def finish_turn(
        self, answer: str, usage: RunUsage, first_text_ms: int | None = None
    ) -> None:
        """Close this turn's session with the answer, its token use and, for a
        streamed turn, how long the owner waited for the first words."""
        if not self._traced():
            return
        metrics = {
            "input_tokens": usage.input_tokens,
            "cache_read_tokens": usage.cache_read_tokens,
            "output_tokens": usage.output_tokens,
            "model_requests": usage.requests,
            "tool_calls": usage.tool_calls,
        }
        if first_text_ms is not None:
            metrics["first_text_ms"] = first_text_ms
        self._enrich_session(outputs={"answer": answer}, metrics=metrics)

    def fail_turn(self, error: str) -> None:
        """Mark this turn's session with the guardrail code or the exception type
        that ended it, so failed turns can be filtered and counted."""
        if not self._traced():
            return
        self._enrich_session(metadata={"error": error})

    def link_conversation(self, conversation_id: int) -> None:
        """Tag this turn's session with the conversation its save just created."""
        if not self._traced():
            return
        self._enrich_session(metadata={"conversation_id": conversation_id})

    @contextmanager
    def span(self, name: str, **fields) -> Iterator[None]:
        """Run the block inside a span of this turn's session; `fields` fill it up front
        and `enrich_span` adds the rest. Without a traced turn the block just runs."""
        if not self._traced():
            yield
            return
        with self._tracer.trace(name, event_type="tool"):
            self._tracer.enrich_span(**fields)
            yield

    def enrich_span(self, **fields) -> None:
        """Add fields to the span the block is running in."""
        if self._traced():
            self._tracer.enrich_span(**fields)

    async def flush(self) -> None:
        """Send the session updates and spans still queued, then stop the tracer, so a
        restart does not drop the last turns."""
        if self._tracer is None:
            return
        if self._background:
            await asyncio.wait(self._background, timeout=2 * self.SESSION_WAIT_SECONDS)
        await asyncio.to_thread(self._tracer.force_flush, timeout_millis=5000)
        await asyncio.to_thread(self._tracer.shutdown)
        self._threads.shutdown(wait=False)

    def _traced(self) -> bool:
        """Whether this turn has a session to update: traces on and the turn sampled."""
        return self._tracer is not None and _session_created.get() is not None

    async def _create_session(self, session_id: str, **fields) -> None:
        created = await self._tracer.acreate_session(
            session_name="agent-chat", session_id=session_id, **fields
        )
        # The SDK returns None instead of raising, so a refused key or an outage would
        # otherwise leave sessions without their fields and no sign why.
        if created is None:
            logger.warning("honeyhive session not created: %s", session_id)

    def _enrich_session(self, **fields) -> None:
        self._run_in_background(
            self._enrich_after_creation(_session_created.get(), fields)
        )

    async def _enrich_after_creation(self, created: asyncio.Task, fields: dict) -> None:
        # An update that reaches HoneyHive before the session exists is lost; a
        # creation that hangs still lets the update try after the wait.
        await asyncio.wait({created}, timeout=self.SESSION_WAIT_SECONDS)
        # The copied context carries this turn's session id to the SDK.
        call = functools.partial(
            contextvars.copy_context().run, self._tracer.enrich_session, **fields
        )
        await asyncio.get_running_loop().run_in_executor(self._threads, call)

    def _run_in_background(self, call: Coroutine) -> asyncio.Task:
        task = asyncio.create_task(call)
        self._background.add(task)
        task.add_done_callback(self._background.discard)
        return task
