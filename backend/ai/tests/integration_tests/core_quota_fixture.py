"""Loopback-only AI process for CoreAiQuotaIT; never a production entry point.

Uses the production router, token check, receipts, chat service and SQL repositories.
Only model execution/cache and infrastructure lifespan are replaced. Test controls
are authenticated and exist solely in this test module.
"""

import argparse
import asyncio
import json
import os
import re
import socket
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import psycopg
import uvicorn
from fastapi import Depends
from pydantic import BaseModel
from pydantic_ai.messages import ModelResponse, TextPart
from pydantic_ai.models.function import FunctionModel
from tests.support import (
    AI_MIGRATIONS,
    TEST_GUARDRAIL_LIMITS,
    FakeRedis,
    apply_ai_baseline,
    schema_url,
)

from src.agent.receipts import AgentTurnRepository
from src.agent.repository import AgentConversationRepository
from src.agent.service import AgentService
from src.agent.turns import AgentTurnService
from src.infra.postgre_db_client import PostgreDBClient
from src.main import app
from src.security import require_internal_token


class Control(BaseModel):
    mode: Literal["SUCCESS", "WAIT", "FAIL", "RELEASE", "DISABLED"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--schema", required=True)
    parser.add_argument("--ready-file", required=True, type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"core_ai_it_[a-f0-9]{32}", args.schema):
        raise SystemExit("Only generated CoreAiQuotaIT schemas are supported")
    database = os.environ["POSTGRES_TEST_URL"]
    # Core has already migrated this disposable schema. Never create/migrate public.
    with psycopg.connect(
        database, options=f"-c search_path={args.schema}", autocommit=True
    ) as sql:
        exists = sql.execute("SELECT to_regclass('agent_turn_receipts')").fetchone()[0]
        if not exists:
            apply_ai_baseline(sql, args.schema)
            for name in (
                "20261107000000_agent_turn_receipts.sql",
                "20261108000000_agent_turn_result_metadata.sql",
            ):
                with sql.transaction():
                    sql.execute((AI_MIGRATIONS / name).read_text(), prepare=False)

    postgres = PostgreDBClient(schema_url(database, args.schema), pool_size=4)
    conversations = AgentConversationRepository(postgres, FakeRedis())
    mode = "SUCCESS"
    calls = 0
    waiting = 0
    gate = threading.Event()
    gate.set()

    async def answer(messages, info):
        nonlocal calls, waiting
        calls += 1
        selected = mode
        if selected == "FAIL":
            raise RuntimeError("synthetic private provider diagnostics")
        if selected == "WAIT":
            waiting += 1
            try:
                if not await asyncio.to_thread(gate.wait, 15):
                    raise RuntimeError("fixture wait timed out")
            finally:
                waiting -= 1
        return ModelResponse(parts=[TextPart("Saved integration answer")])

    async def stream(messages, info):
        result = await answer(messages, info)
        for word in result.parts[0].content.split():
            yield word + " "

    model = FunctionModel(answer, stream_function=stream, model_name="quota-it-model")
    app.state.agent = AgentService(model, conversations, TEST_GUARDRAIL_LIMITS)
    turns = AgentTurnService(AgentTurnRepository(postgres), app.state.agent, True)
    app.state.conversations = conversations
    app.state.turns = turns
    app.state.memory = None

    @asynccontextmanager
    async def lifespan(_):
        try:
            yield
        finally:
            gate.set()
            postgres.close()

    app.router.lifespan_context = lifespan

    @app.get("/__test__/stats", dependencies=[Depends(require_internal_token)])
    async def stats():
        return {"calls": calls, "waiting": waiting}

    @app.post("/__test__/control", dependencies=[Depends(require_internal_token)])
    async def control(body: Control):
        nonlocal mode
        turns.enabled = body.mode != "DISABLED"
        mode = body.mode if body.mode in {"SUCCESS", "WAIT", "FAIL"} else "SUCCESS"
        if body.mode == "WAIT":
            gate.clear()
        else:
            gate.set()
        return {"ok": True}

    # Keep the OS-selected listening socket open; no free-port discovery race.
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        config = uvicorn.Config(app, log_level="warning", access_log=False)
        temporary = args.ready_file.with_suffix(".tmp")
        temporary.write_text(json.dumps({"port": listener.getsockname()[1]}))
        temporary.replace(args.ready_file)
        uvicorn.Server(config).run(sockets=[listener])


if __name__ == "__main__":
    main()
