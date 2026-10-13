from dataclasses import dataclass

from sqlalchemy import BigInteger, Select, String, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.postgre_db_client import Base, PostgreDBClient


class Product(Base):
    """Core's `products` table, read-only here; Core's Flyway owns the schema."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    shop_id: Mapped[int] = mapped_column(BigInteger)
    name: Mapped[str] = mapped_column(String(255))
    unit: Mapped[str] = mapped_column(String(50))
    selling_price_vnd: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(20))


class CatalogUnavailableError(Exception):
    """The shop catalog could not be read; the caller falls back to manual entry.

    Raised for every database failure, including a timeout, so #3/#60 can map one
    domain error to the Core fallback instead of leaking SQLAlchemy exceptions.
    """


@dataclass(frozen=True)
class CatalogProduct:
    """One ACTIVE product of a shop, with the fields a draft needs.

    `id` is Core's `products.id`, a BIGINT, and stays a plain `int`.
    """

    id: int
    name: str
    unit: str
    selling_price_vnd: int


class ProductCatalogRepository:
    """Read-only catalog of one shop already authenticated by Core (#37).

    Core authenticates the owner and passes `shop_id`; every query filters on it in
    SQL and binds it as a parameter, so a result can never contain another shop's
    products. The repository only reads the catalog: it never writes sales, payments,
    expenses or stock. A missing `shop_id` or `product_id` fails closed, and every
    database failure becomes `CatalogUnavailableError` so the caller (#3) can fall back
    to manual text or POS entry.
    """

    def __init__(self, postgres: PostgreDBClient, timeout_ms: int = 3000) -> None:
        if timeout_ms < 1:
            raise ValueError("timeout_ms must be positive")
        self.postgres = postgres
        self.timeout_ms = timeout_ms

    def list_active_products(self, shop_id: int | None) -> list[CatalogProduct]:
        """Return the shop's ACTIVE products, ordered by name then id.

        Archived products never appear, and `shop_id` is the only shop in scope. A
        missing shop id returns nothing rather than dropping the shop filter.
        """
        if shop_id is None:
            return []
        rows = self._fetch(
            select(Product.id, Product.name, Product.unit, Product.selling_price_vnd)
            .where(Product.shop_id == shop_id, Product.status == "ACTIVE")
            .order_by(Product.name, Product.id)
        )
        return [CatalogProduct(*row) for row in rows]

    def is_active_product(self, shop_id: int | None, product_id: int | None) -> bool:
        """Whether `product_id` is an ACTIVE product of `shop_id`.

        A product of another shop, an archived product, an unknown id and a missing
        shop or product id all return False, so a model-supplied id can be rejected
        before it reaches a draft.
        """
        if shop_id is None or product_id is None:
            return False
        return bool(
            self._fetch(
                select(Product.id).where(
                    Product.shop_id == shop_id,
                    Product.id == product_id,
                    Product.status == "ACTIVE",
                )
            )
        )

    def _fetch(self, statement: Select) -> list[tuple]:
        # Requests share a small connection pool, so a hung query would stall the
        # others. Cap the run time transaction-locally, like the SQL executor.
        try:
            with self.postgres.session() as session:
                session.execute(
                    select(
                        func.set_config("statement_timeout", str(self.timeout_ms), True)
                    )
                )
                return [tuple(row) for row in session.execute(statement)]
        except (SQLAlchemyError, RuntimeError) as error:
            raise CatalogUnavailableError("catalog unavailable") from error
