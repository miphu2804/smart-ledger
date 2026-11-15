"""Opt-in durable protocol around the existing guarded JSON/SSE agent flow."""

import asyncio
from collections.abc import AsyncIterator
from functools import partial
from typing import NoReturn
from uuid import UUID

from src.agent.conversation_repository import AgentConversationRepository
from src.agent.errors import (
    SAFE_ERRORS,
    TurnProtocolError,
    failure_code,
    failure_status,
)
from src.agent.schema import AgentChatRequest
from src.agent.service import AgentChatResult, AgentService, AgentStreamEvent, Done
from src.agent.turn_repository import (
    AgentTurnRepository,
    TurnExecution,
    TurnReceipt,
    TurnState,
)


class AgentTurnService:
    def __init__(
        self,
        repository: AgentTurnRepository,
        conversations: AgentConversationRepository,
        agent: AgentService,
        enabled: bool = False,
    ):
        self.repository = repository
        self.conversations = conversations
        self.agent = agent
        self.enabled = enabled

    def require_enabled(self) -> None:
        if not self.enabled:
            raise TurnProtocolError("ai_turn_unavailable", 503)

    async def admit(self, payload: AgentChatRequest) -> tuple[bool, TurnExecution]:
        self.require_enabled()
        created, _, fingerprint = await asyncio.to_thread(
            self.repository.admit,
            payload.turn_id,
            payload.user_id,
            payload.shop_id,
            payload.conversation_id,
            payload.message,
            payload.execution_fence,
        )
        execution = TurnExecution(
            payload.turn_id,
            payload.user_id,
            payload.shop_id,
            payload.execution_fence,
            fingerprint,
        )
        return created, execution

    async def chat_turn(self, payload: AgentChatRequest) -> AgentChatResult | None:
        """Run a receipted turn once; a retry replays its outcome.

        Returns None while another execution of the turn is still running.
        """
        created, execution = await self.admit(payload)
        if created:
            return await self.chat(payload, execution)
        return await self.replay(execution)

    async def stream_turn(
        self, payload: AgentChatRequest
    ) -> AsyncIterator[AgentStreamEvent] | None:
        """The streaming form of `chat_turn`: a replay streams only its `Done`."""
        created, execution = await self.admit(payload)
        if created:
            return await self.stream(payload, execution)
        result = await self.replay(execution)
        if result is None:
            return None
        return self._replayed(result)

    @staticmethod
    async def _replayed(result: AgentChatResult) -> AsyncIterator[AgentStreamEvent]:
        yield Done(result)

    async def read(self, turn: UUID, user: int, shop: int) -> TurnReceipt:
        self.require_enabled()
        return await asyncio.to_thread(self.repository.get, turn, user, shop)

    async def cancel(self, turn: UUID, user: int, shop: int, fence: int) -> TurnReceipt:
        self.require_enabled()
        return await asyncio.to_thread(self.repository.cancel, turn, user, shop, fence)

    async def replay(self, execution: TurnExecution) -> AgentChatResult | None:
        row = await self.read(execution.turn_id, execution.user_id, execution.shop_id)
        if row.state == TurnState.IN_PROGRESS:
            return None
        if row.state == TurnState.SUCCEEDED:
            if not row.result_available:
                raise TurnProtocolError("ai_turn_result_removed", 410)
            return AgentChatResult(
                **{
                    key: value
                    for key, value in row.result.items()
                    if key != "request_id"
                }
            )
        code = row.failure_code
        status = 409 if row.state == TurnState.CANCELLED else failure_status(code)
        raise TurnProtocolError(code, status)

    async def _failed(self, execution: TurnExecution, error: Exception) -> None:
        await asyncio.to_thread(self.repository.fail, execution, failure_code(error))

    @staticmethod
    def _raise_safe(error: Exception) -> NoReturn:
        if isinstance(error, SAFE_ERRORS):
            raise error
        raise TurnProtocolError("ai_unavailable", 503) from None

    async def chat(
        self, payload: AgentChatRequest, execution: TurnExecution
    ) -> AgentChatResult:
        try:
            return await self.agent.chat(
                user_id=payload.user_id,
                shop_id=payload.shop_id,
                message=payload.message,
                conversation_id=payload.conversation_id,
                save=partial(self._save_exchange, execution),
            )
        except asyncio.CancelledError:
            # A running DB write races cancellation under the receipt lock.
            await self.cancel(
                execution.turn_id, execution.user_id, execution.shop_id, execution.fence
            )
            raise
        except Exception as error:
            await self._failed(execution, error)
            self._raise_safe(error)

    async def stream(
        self, payload: AgentChatRequest, execution: TurnExecution
    ) -> AsyncIterator[AgentStreamEvent]:
        try:
            events = await self.agent.stream_chat(
                user_id=payload.user_id,
                shop_id=payload.shop_id,
                message=payload.message,
                conversation_id=payload.conversation_id,
                save=partial(self._save_exchange, execution),
            )
        except asyncio.CancelledError:
            await self.cancel(
                execution.turn_id, execution.user_id, execution.shop_id, execution.fence
            )
            raise
        except Exception as error:
            await self._failed(execution, error)
            self._raise_safe(error)

        async def iterate() -> AsyncIterator[AgentStreamEvent]:
            completed = False
            try:
                async for event in events:
                    if isinstance(event, Done):
                        completed = True
                    yield event
            except Exception as error:
                await self._failed(execution, error)
                self._raise_safe(error)
            finally:
                try:
                    await events.aclose()
                finally:
                    if not completed:
                        await self.cancel(
                            execution.turn_id,
                            execution.user_id,
                            execution.shop_id,
                            execution.fence,
                        )

        return iterate()

    def _save_exchange(
        self,
        execution: TurnExecution,
        conversation_id: int | None,
        question: str,
        answer: str,
        model: str,
        version: str,
    ) -> tuple[int, int]:
        """Save the exchange atomically with the turn's receipt, then drop the cached
        history.

        The agent runs it as one worker-thread call, so a disconnect after the commit
        still drops the cache. `AgentTurnRepository.complete` owns the transaction and
        its lock order (conversation row, then receipt row).
        """
        saved_conversation_id, message_id = self.repository.complete(
            execution,
            self.conversations,
            conversation_id,
            question,
            answer,
            model,
            version,
        )
        self.conversations.drop_cached_history(
            saved_conversation_id, execution.user_id, execution.shop_id
        )
        return saved_conversation_id, message_id
