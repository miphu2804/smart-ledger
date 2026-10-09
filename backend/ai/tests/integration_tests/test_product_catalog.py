import os
import uuid
from collections.abc import Iterator
from dataclasses import dataclass

import psycopg
import pytest
from psycopg import sql
from tests.support import apply_core_migrations, schema_url

from src.drafts.catalog import CatalogUnavailableError, ProductCatalogRepository
from src.infra.postgre_db_client import PostgreDBClient


@dataclass
class CatalogDatabase:
    admin: psycopg.Connection
    database_url: str
    schema: str
    postgres: PostgreDBClient
    repository: ProductCatalogRepository
    shop_a: int
    shop_b: int
    shop_a_coffee: int
    shop_a_archived: int
    shop_b_coffee: int


@pytest.fixture
def catalog_db() -> Iterator[CatalogDatabase]:
    """Core schema in a throwaway schema, with two shops sharing one product name."""
    database_url = os.getenv("POSTGRES_TEST_URL")
    if not database_url:
        pytest.skip("set POSTGRES_TEST_URL to run PostgreSQL catalog tests")

    schema = f"catalog_{uuid.uuid4().hex[:12]}"
    admin = psycopg.connect(database_url, autocommit=True)
    postgres = None
    try:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        admin.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
        apply_core_migrations(admin)

        owner_a = admin.execute(
            "INSERT INTO users (display_name) VALUES ('Owner A') RETURNING id"
        ).fetchone()[0]
        owner_b = admin.execute(
            "INSERT INTO users (display_name) VALUES ('Owner B') RETURNING id"
        ).fetchone()[0]
        shop_a = admin.execute(
            "INSERT INTO shops (owner_id, name, industry) "
            "VALUES (%s, 'Shop A', 'Retail') RETURNING id",
            (owner_a,),
        ).fetchone()[0]
        shop_b = admin.execute(
            "INSERT INTO shops (owner_id, name, industry) "
            "VALUES (%s, 'Shop B', 'Retail') RETURNING id",
            (owner_b,),
        ).fetchone()[0]

        # Same product name in both shops, at different prices, so a missing shop
        # filter would be visible in the returned price.
        shop_a_coffee = admin.execute(
            "INSERT INTO products (shop_id, name, unit, selling_price_vnd) "
            "VALUES (%s, 'Cà phê sữa', 'cup', 25000) RETURNING id",
            (shop_a,),
        ).fetchone()[0]
        admin.execute(
            "INSERT INTO products (shop_id, name, unit, selling_price_vnd) "
            "VALUES (%s, 'Trà đào', 'glass', 30000)",
            (shop_a,),
        )
        shop_a_archived = admin.execute(
            "INSERT INTO products "
            "(shop_id, name, unit, selling_price_vnd, status, archived_at, "
            "archived_by_user_id) "
            "VALUES (%s, 'Bạc xỉu', 'cup', 28000, 'ARCHIVED', now(), %s) RETURNING id",
            (shop_a, owner_a),
        ).fetchone()[0]
        shop_b_coffee = admin.execute(
            "INSERT INTO products (shop_id, name, unit, selling_price_vnd) "
            "VALUES (%s, 'Cà phê sữa', 'cup', 99000) RETURNING id",
            (shop_b,),
        ).fetchone()[0]

        postgres = PostgreDBClient(schema_url(database_url, schema))
        yield CatalogDatabase(
            admin=admin,
            database_url=database_url,
            schema=schema,
            postgres=postgres,
            repository=ProductCatalogRepository(postgres),
            shop_a=shop_a,
            shop_b=shop_b,
            shop_a_coffee=shop_a_coffee,
            shop_a_archived=shop_a_archived,
            shop_b_coffee=shop_b_coffee,
        )
    finally:
        if postgres is not None:
            postgres.close()
        admin.execute(
            sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema))
        )
        admin.close()


def test_list_active_products_returns_only_the_requested_shop(
    catalog_db: CatalogDatabase,
) -> None:
    products_a = catalog_db.repository.list_active_products(catalog_db.shop_a)
    products_b = catalog_db.repository.list_active_products(catalog_db.shop_b)

    by_id_a = {product.id: product for product in products_a}
    assert catalog_db.shop_a_coffee in by_id_a
    assert catalog_db.shop_a_archived not in by_id_a
    assert catalog_db.shop_b_coffee not in by_id_a

    coffee_a = by_id_a[catalog_db.shop_a_coffee]
    assert coffee_a.name == "Cà phê sữa"
    assert coffee_a.unit == "cup"
    assert coffee_a.selling_price_vnd == 25000

    assert [product.id for product in products_b] == [catalog_db.shop_b_coffee]
    assert products_b[0].selling_price_vnd == 99000


def test_is_active_product_rejects_cross_shop_archived_and_unknown(
    catalog_db: CatalogDatabase,
) -> None:
    repository = catalog_db.repository

    assert repository.is_active_product(catalog_db.shop_a, catalog_db.shop_a_coffee)
    assert repository.is_active_product(catalog_db.shop_b, catalog_db.shop_b_coffee)

    assert not repository.is_active_product(catalog_db.shop_a, catalog_db.shop_b_coffee)
    assert not repository.is_active_product(
        catalog_db.shop_a, catalog_db.shop_a_archived
    )
    assert not repository.is_active_product(catalog_db.shop_a, 999999999)


def test_missing_or_unknown_shop_returns_nothing(catalog_db: CatalogDatabase) -> None:
    repository = catalog_db.repository

    assert repository.list_active_products(999999999) == []
    assert not repository.is_active_product(999999999, catalog_db.shop_a_coffee)

    # A missing shop id must fail closed instead of dropping the shop filter.
    assert repository.list_active_products(None) == []
    assert not repository.is_active_product(None, catalog_db.shop_a_coffee)
    # A model-supplied null id is never an active product.
    assert not repository.is_active_product(catalog_db.shop_a, None)


def test_unavailable_database_raises_and_writes_nothing(
    catalog_db: CatalogDatabase,
) -> None:
    offline = ProductCatalogRepository(PostgreDBClient())

    with pytest.raises(CatalogUnavailableError):
        offline.list_active_products(catalog_db.shop_a)
    with pytest.raises(CatalogUnavailableError):
        offline.is_active_product(catalog_db.shop_a, catalog_db.shop_a_coffee)

    # The failed reads leave the Core tables untouched.
    assert catalog_db.admin.execute("SELECT count(*) FROM products").fetchone()[0] == 4
    assert catalog_db.admin.execute("SELECT count(*) FROM sales").fetchone()[0] == 0


def test_locked_catalog_times_out_as_unavailable(
    catalog_db: CatalogDatabase,
) -> None:
    # A table lock makes the SELECT block; statement_timeout must cancel it instead
    # of holding the shared connection until the client gives up.
    blocker = psycopg.connect(catalog_db.database_url)
    try:
        blocker.execute(
            sql.SQL("SET search_path TO {}").format(sql.Identifier(catalog_db.schema))
        )
        blocker.execute("LOCK TABLE products IN ACCESS EXCLUSIVE MODE")

        repository = ProductCatalogRepository(catalog_db.postgres, timeout_ms=200)
        with pytest.raises(CatalogUnavailableError):
            repository.list_active_products(catalog_db.shop_a)
    finally:
        blocker.rollback()
        blocker.close()

    # The shared connection survives the cancelled query and still serves the catalog.
    assert catalog_db.repository.list_active_products(catalog_db.shop_a)
