import os
import uuid
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from psycopg import sql

from src.drafts.catalog import CatalogProduct, ProductCatalogRepository
from src.infra.postgre_db_client import PostgreDBClient

BACKEND_ROOT = Path(__file__).resolve().parents[3]
CORE_MIGRATION = (
    BACKEND_ROOT / "core/src/main/resources/db/migration/V1__create_auth_and_shops.sql"
)
CATALOG_FIXTURE = BACKEND_ROOT / "ai/tests/fixtures/core_products.sql"


@pytest.fixture
def postgres_catalog_client() -> Iterator[tuple[PostgreDBClient, int, int, int, int]]:
    database_url = os.getenv("POSTGRES_TEST_URL")
    if not database_url:
        pytest.skip("set POSTGRES_TEST_URL to run PostgreSQL endpoint tests")

    schema_name = f"catalog_test_{uuid.uuid4().hex}"
    setup_connection = psycopg.connect(database_url, autocommit=True)
    postgres = None
    try:
        setup_connection.execute(
            sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema_name))
        )
        setup_connection.execute(
            sql.SQL("SET search_path TO {}").format(sql.Identifier(schema_name))
        )
        setup_connection.execute(CORE_MIGRATION.read_text(), prepare=False)
        setup_connection.execute(CATALOG_FIXTURE.read_text(), prepare=False)

        user_a_id = setup_connection.execute(
            "INSERT INTO users (display_name) VALUES (%s) RETURNING id",
            ("User A",),
        ).fetchone()[0]
        user_b_id = setup_connection.execute(
            "INSERT INTO users (display_name) VALUES (%s) RETURNING id",
            ("User B",),
        ).fetchone()[0]

        shop_a_id = setup_connection.execute(
            """
            INSERT INTO shops (owner_id, name, industry)
            VALUES (%s, %s, %s)
            RETURNING id
            """,
            (user_a_id, "Shop A", "Retail"),
        ).fetchone()[0]
        shop_b_id = setup_connection.execute(
            """
            INSERT INTO shops (owner_id, name, industry)
            VALUES (%s, %s, %s)
            RETURNING id
            """,
            (user_b_id, "Shop B", "Retail"),
        ).fetchone()[0]

        postgres = PostgreDBClient()
        postgres.connection = psycopg.connect(
            database_url,
            options=f"-c search_path={schema_name}",
        )
        yield postgres, shop_a_id, shop_b_id, user_a_id, user_b_id
    finally:
        if postgres is not None and postgres.connection is not None:
            postgres.connection.close()
        try:
            setup_connection.execute(
                sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                    sql.Identifier(schema_name)
                )
            )
        finally:
            setup_connection.close()


def test_list_active_returns_shop_products(
    postgres_catalog_client: tuple[PostgreDBClient, int, int, int, int],
) -> None:
    postgres, shop_a_id, shop_b_id, user_a_id, user_b_id = postgres_catalog_client
    repository = ProductCatalogRepository(postgres)

    with postgres.transaction() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO products (shop_id, name, unit, selling_price_vnd, status)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (shop_a_id, "Cà phê sữa", "cup", 25000, "ACTIVE"),
            )
            coffee_a_id = cursor.fetchone()[0]

            cursor.execute(
                """
                INSERT INTO products (shop_id, name, unit, selling_price_vnd, status)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (shop_b_id, "Cà phê sữa", "cup", 30000, "ACTIVE"),
            )
            coffee_b_id = cursor.fetchone()[0]

            cursor.execute(
                """
                INSERT INTO products
                (shop_id, name, unit, selling_price_vnd, status,
                 archived_at, archived_by_user_id)
                VALUES (%s, %s, %s, %s, %s, now(), %s)
                RETURNING id
                """,
                (shop_a_id, "Bạc xỉu", "cup", 28000, "ARCHIVED", user_a_id),
            )
            bac_xiu_id = cursor.fetchone()[0]

            cursor.execute(
                """
                INSERT INTO products (shop_id, name, unit, selling_price_vnd, status)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (shop_a_id, "Bạc xỉu", "cup", 27000, "ACTIVE"),
            )
            bac_xiu_active_id = cursor.fetchone()[0]

    products_a = repository.list_active(shop_a_id)

    assert len(products_a) == 2
    assert all(isinstance(p, CatalogProduct) for p in products_a)

    product_ids = [p.id for p in products_a]
    assert coffee_a_id in product_ids
    assert bac_xiu_active_id in product_ids
    assert coffee_b_id not in product_ids
    assert bac_xiu_id not in product_ids

    coffee = next(p for p in products_a if p.id == coffee_a_id)
    assert coffee.name == "Cà phê sữa"
    assert coffee.unit == "cup"
    assert coffee.selling_price_vnd == 25000

    bac_xiu = next(p for p in products_a if p.id == bac_xiu_active_id)
    assert bac_xiu.name == "Bạc xỉu"
    assert bac_xiu.unit == "cup"
    assert bac_xiu.selling_price_vnd == 27000

    assert [p.id for p in repository.list_active(shop_b_id)] == [coffee_b_id]


def test_list_active_unknown_shop_returns_empty(
    postgres_catalog_client: tuple[PostgreDBClient, int, int, int, int],
) -> None:
    postgres, shop_a_id, shop_b_id, user_a_id, user_b_id = postgres_catalog_client
    repository = ProductCatalogRepository(postgres)

    products = repository.list_active(999999)

    assert products == []
