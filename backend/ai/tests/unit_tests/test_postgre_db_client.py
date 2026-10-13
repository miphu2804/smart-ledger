import pytest

from src.infra.postgre_db_client import PostgreDBClient


def test_postgres_scheme_uses_the_psycopg_driver() -> None:
    client = PostgreDBClient("postgres://reader@127.0.0.1:1/db")

    assert client.engine.dialect.driver == "psycopg"
    client.close()


def test_unreadable_url_leaves_the_database_unavailable() -> None:
    client = PostgreDBClient("host=127.0.0.1 dbname=db")

    assert client.engine is None
    with pytest.raises(RuntimeError, match="postgres unavailable"):
        client.session()
