import asyncio
from pathlib import Path

from evaluation.core.schema import Case, Output
from evaluation.targets.caching_embedder import CachingEmbedder
from evaluation.targets.database import require_local_database
from pydantic_ai.models.test import TestModel
from sqlalchemy import text

from src.app_config import app_config
from src.infra.postgre_db_client import PostgreDBClient
from src.memory.repository import AgentMemoryRepository, NewMemory
from src.memory.service import AgentMemoryService

# Deleted in this order, because each row refers to the ones above it.
DELETIONS = (
    "DELETE FROM agent_memories WHERE shop_id = :shop",
    "DELETE FROM chat_conversations WHERE shop_id = :shop",
    "DELETE FROM shops WHERE id = :shop",
    "DELETE FROM users WHERE id = :owner",
)


class MemoryTarget:
    """The real `AgentMemoryService.with_memories` on the local database.

    Entering creates a made-up owner and shop for each frozen shop and stores its
    memories through the repository; leaving deletes every row it created, also when
    entering failed half way. Vectors come from a file in `cache_directory`.
    """

    def __init__(self, shops: list[dict], cache_directory: Path) -> None:
        self.shops = shops
        self.cache_directory = cache_directory
        # Shop key -> the database ids of its owner and shop, and its memories' ids
        # mapped back to their positions in the shop.
        self.created: dict[str, dict] = {}

    async def __aenter__(self) -> "MemoryTarget":
        require_local_database(app_config.POSTGRES_URL)
        self.postgres = PostgreDBClient(app_config.POSTGRES_URL)
        self.embedder = CachingEmbedder(self.cache_directory)
        # Recall makes no model call, so the model only has to exist for the
        # service to build its extraction agents.
        self.service = AgentMemoryService(
            TestModel(),
            AgentMemoryRepository(self.postgres),
            self.embedder,
            frozenset(),
        )
        try:
            for shop in self.shops:
                await self._create_shop(shop)
        except BaseException:
            await self.__aexit__()
            raise
        return self

    async def __aexit__(self, *error) -> None:
        try:
            with self.postgres.session() as session:
                for created in self.created.values():
                    for statement in DELETIONS:
                        session.execute(
                            text(statement),
                            {"shop": created["shop"], "owner": created["owner"]},
                        )
        finally:
            self.embedder.save()
            self.postgres.close()

    async def ask(self, case: Case) -> Output:
        created = self.created[case.inputs["shop"]]
        _, recalled = await self.service.with_memories(
            created["shop"], created["owner"], case.inputs["query"]
        )
        return Output(
            {"recalled": [created["positions"][item.id] for item in recalled]}
        )

    async def _create_shop(self, shop: dict) -> None:
        """Makes the owner and shop, stores the memories and maps their ids."""
        owner, shop_id, conversation = self._insert_rows(shop["shop"])
        # Recorded before the memories go in, so a failure still deletes this shop.
        created = {"owner": owner, "shop": shop_id, "positions": {}}
        self.created[shop["shop"]] = created
        await self._store_memories(shop["memories"], owner, shop_id, conversation)
        await self._map_positions(created, shop)

    def _insert_rows(self, key: str) -> tuple[int, int, int]:
        """The ids of a new owner, their shop and a conversation for its memories."""
        with self.postgres.session() as session:
            owner = session.execute(
                text("INSERT INTO users (display_name) VALUES (:name) RETURNING id"),
                {"name": f"Memory eval {key}"},
            ).scalar_one()
            shop_id = session.execute(
                text(
                    "INSERT INTO shops (owner_id, name, industry) "
                    "VALUES (:owner, :name, 'Tạp hóa') RETURNING id"
                ),
                {"owner": owner, "name": f"Memory eval {key}"},
            ).scalar_one()
            conversation = session.execute(
                text(
                    "INSERT INTO chat_conversations (user_id, shop_id, title) "
                    "VALUES (:owner, :shop, 'memory eval') RETURNING id"
                ),
                {"owner": owner, "shop": shop_id},
            ).scalar_one()
        return owner, shop_id, conversation

    async def _store_memories(
        self, memories: list[dict], owner: int, shop_id: int, conversation: int
    ) -> None:
        vectors = await self.embedder.embed_documents(
            [memory["content"] for memory in memories]
        )
        await asyncio.to_thread(
            self.service.repository.add,
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

    async def _map_positions(self, created: dict, shop: dict) -> None:
        """Maps each stored row's id to its position in the shop. The database numbers
        the rows in the order they went in."""
        stored = sorted(
            await asyncio.to_thread(
                self.service.repository.list_live, created["shop"], created["owner"]
            ),
            key=lambda row: row.id,
        )
        for row, memory in zip(stored, shop["memories"], strict=True):
            if row.content != memory["content"]:
                raise RuntimeError(f"shop {shop['shop']}: stored order differs")
            created["positions"][row.id] = memory["id"]
