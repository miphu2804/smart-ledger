from dataclasses import dataclass

from src.infra.postgre_db_client import PostgreDBClient


@dataclass(frozen=True)
class CatalogProduct:
    id: int
    name: str
    unit: str
    selling_price_vnd: int


class ProductCatalogRepository:
    def __init__(self, postgres: PostgreDBClient) -> None:
        self.postgres = postgres

    def list_active_products(self, shop_id: int) -> list[CatalogProduct]:
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, name, unit, selling_price_vnd
                    FROM products
                    WHERE shop_id = %s AND status = 'ACTIVE'
                    ORDER BY name, id
                    LIMIT 300
                    """,
                    (shop_id,),
                )
                rows = cursor.fetchall()
        return [
            CatalogProduct(
                id=row[0], name=row[1], unit=row[2], selling_price_vnd=row[3]
            )
            for row in rows
        ]
