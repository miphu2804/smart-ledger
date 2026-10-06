from dataclasses import dataclass

from src.infra.postgre_db_client import PostgreDBClient


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
    expenses or stock. Database errors and timeouts propagate so the caller (#3) can
    fall back to manual text or POS entry.
    """

    def __init__(self, postgres: PostgreDBClient) -> None:
        self.postgres = postgres

    def list_active_products(self, shop_id: int) -> list[CatalogProduct]:
        """Return the shop's ACTIVE products, ordered by name then id.

        Archived products never appear, and `shop_id` is the only shop in scope.
        """
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, name, unit, selling_price_vnd
                    FROM products
                    WHERE shop_id = %s AND status = 'ACTIVE'
                    ORDER BY name, id
                    """,
                    (shop_id,),
                )
                rows = cursor.fetchall()
        return [CatalogProduct(row[0], row[1], row[2], row[3]) for row in rows]

    def is_active_product(self, shop_id: int, product_id: int) -> bool:
        """Whether `product_id` is an ACTIVE product of `shop_id`.

        A product of another shop, an archived product, an unknown id and a missing
        shop id all return False, so a model-supplied id can be rejected before it
        reaches a draft.
        """
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT 1
                    FROM products
                    WHERE shop_id = %s AND id = %s AND status = 'ACTIVE'
                    """,
                    (shop_id, product_id),
                )
                row = cursor.fetchone()
        return row is not None
