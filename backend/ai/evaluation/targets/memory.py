import asyncio
import json
import math
import sys
from pathlib import Path

from evaluation.core.schema import Case, Output
from evaluation.targets.database import require_local_database
from pydantic_ai.embeddings import EmbeddingResult
from pydantic_ai.models.test import TestModel
from sqlalchemy import text

from src.app_config import app_config
from src.infra.postgre_db_client import PostgreDBClient
from src.main import build_memory_embedder
from src.memory.repository import AgentMemoryRepository, NewMemory
from src.memory.service import AgentMemoryService

SUITE = Path(__file__).resolve().parents[1] / "suites" / "memory"
BATCH = 50


def load_shops() -> list[dict]:
    """The frozen shops of `cases.jsonl`: memories and the queries that need one."""
    return [
        json.loads(line) for line in (SUITE / "cases.jsonl").read_text().splitlines()
    ]


def load_cases(shops: list[dict]) -> list[Case]:
    """One case per query. The memory ids in `truth` are positions in the shop."""
    return [
        Case(
            f"{shop['shop']}/{number}",
            {"shop": shop["shop"], "query": query["text"]},
            {"gold": query["gold"], "form": query["form"], "stale": query["stale"]},
            expected=[query["gold"]],
        )
        for shop in shops
        for number, query in enumerate(shop["queries"])
    ]


class CachingEmbedder:
    """Embeds from a file of vectors, asking the app's embedder only for texts the
    file lacks, so a rerun with a model makes no network call.

    Vectors are unit length, keyed "q|<query>" and "d|<memory>", one file per model.
    It answers the two calls `AgentMemoryService` makes of an embedder.
    """

    def __init__(self) -> None:
        self.model = app_config.AGENT_MEMORY_EMBEDDING_MODEL
        self.path = SUITE / "cache" / f"{self.model.replace('/', '_').lstrip('@')}.json"
        self.vectors: dict[str, list[float]] = (
            json.loads(self.path.read_text()) if self.path.exists() else {}
        )
        self.saved = len(self.vectors)

    async def embed_query(self, query: str) -> EmbeddingResult:
        return await self._embed("q", "query", [query])

    async def embed_documents(self, documents: list[str]) -> EmbeddingResult:
        return await self._embed("d", "document", documents)

    def save(self) -> None:
        if len(self.vectors) != self.saved:
            self.path.parent.mkdir(exist_ok=True)
            self.path.write_text(json.dumps(self.vectors))

    async def _embed(self, kind: str, input_type, texts: list[str]) -> EmbeddingResult:
        missing = sorted({one for one in texts if f"{kind}|{one}" not in self.vectors})
        if missing:
            embedder = build_memory_embedder()
            if embedder is None:
                raise SystemExit(
                    "no memory embedder: check AGENT_MEMORY_EMBEDDING_* in .env"
                )
            embed = embedder.embed_query if kind == "q" else embedder.embed_documents
            for start in range(0, len(missing), BATCH):
                batch = missing[start : start + BATCH]
                result = await embed(batch)
                for one, vector in zip(batch, result.embeddings, strict=True):
                    self.vectors[f"{kind}|{one}"] = self._unit(vector)
                print(f"embedded {len(self.vectors)} texts", file=sys.stderr)
        return EmbeddingResult(
            [self.vectors[f"{kind}|{one}"] for one in texts],
            inputs=texts,
            input_type=input_type,
            model_name=self.model,
            provider_name="cache",
        )

    @staticmethod
    def _unit(vector: list[float]) -> list[float]:
        """`vector` scaled to length 1, so a dot product is the cosine pgvector uses."""
        norm = math.sqrt(sum(x * x for x in vector)) or 1.0
        return [x / norm for x in vector]


class MemoryTarget:
    """The real `AgentMemoryService.with_memories` on the local database.

    Entering creates a made-up owner and shop for each frozen shop and stores its
    memories through the repository; leaving deletes every row it created, also when
    entering failed half way.
    """

    def __init__(self, shops: list[dict]) -> None:
        self.shops = shops
        # Shop key -> the database ids of its owner and shop, and its memories' ids
        # mapped back to their positions in the shop.
        self.created: dict[str, dict] = {}

    async def __aenter__(self) -> "MemoryTarget":
        require_local_database(app_config.POSTGRES_URL)
        self.postgres = PostgreDBClient(app_config.POSTGRES_URL)
        self.embedder = CachingEmbedder()
        repository = AgentMemoryRepository(self.postgres)
        # Recall makes no model call, so the model only has to exist for the
        # service to build its extraction agents.
        self.service = AgentMemoryService(
            TestModel(), repository, self.embedder, frozenset()
        )
        try:
            for shop in self.shops:
                await self._create(shop)
        except BaseException:
            await self.__aexit__()
            raise
        return self

    async def __aexit__(self, *error) -> None:
        try:
            with self.postgres.session() as session:
                for created in self.created.values():
                    for statement in (
                        "DELETE FROM agent_memories WHERE shop_id = :shop",
                        "DELETE FROM chat_conversations WHERE shop_id = :shop",
                        "DELETE FROM shops WHERE id = :shop",
                        "DELETE FROM users WHERE id = :owner",
                    ):
                        session.execute(
                            text(statement),
                            {"shop": created["shop"], "owner": created["owner"]},
                        )
        finally:
            self.embedder.save()
            self.postgres.close()

    async def __call__(self, case: Case) -> Output:
        created = self.created[case.inputs["shop"]]
        _, recalled = await self.service.with_memories(
            created["shop"], created["owner"], case.inputs["query"]
        )
        return Output(
            {"recalled": [created["positions"][item.id] for item in recalled]}
        )

    async def _create(self, shop: dict) -> None:
        """Makes the owner and shop, stores the memories and maps their ids."""
        with self.postgres.session() as session:
            owner = session.execute(
                text("INSERT INTO users (display_name) VALUES (:name) RETURNING id"),
                {"name": f"Memory eval {shop['shop']}"},
            ).scalar_one()
            shop_id = session.execute(
                text(
                    "INSERT INTO shops (owner_id, name, industry) "
                    "VALUES (:owner, :name, 'Tạp hóa') RETURNING id"
                ),
                {"owner": owner, "name": f"Memory eval {shop['shop']}"},
            ).scalar_one()
            conversation = session.execute(
                text(
                    "INSERT INTO chat_conversations (user_id, shop_id, title) "
                    "VALUES (:owner, :shop, 'memory eval') RETURNING id"
                ),
                {"owner": owner, "shop": shop_id},
            ).scalar_one()
        # Recorded before the memories go in, so a failure still deletes this shop.
        created = {"owner": owner, "shop": shop_id, "positions": {}}
        self.created[shop["shop"]] = created
        memories = shop["memories"]
        vectors = await self.embedder.embed_documents(
            [memory["content"] for memory in memories]
        )
        repository = self.service.repository
        await asyncio.to_thread(
            repository.add,
            shop_id,
            owner,
            conversation,
            [
                NewMemory(
                    memory["memory_type"],
                    memory["content"],
                    memory["importance"],
                    vector,
                )
                for memory, vector in zip(memories, vectors.embeddings, strict=True)
            ],
        )
        # The database numbers the rows in the order they went in.
        stored = sorted(
            await asyncio.to_thread(repository.list_live, shop_id, owner),
            key=lambda row: row.id,
        )
        for row, memory in zip(stored, memories, strict=True):
            if row.content != memory["content"]:
                raise RuntimeError(f"shop {shop['shop']}: stored order differs")
            created["positions"][row.id] = memory["id"]
