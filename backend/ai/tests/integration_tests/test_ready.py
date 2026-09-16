from fastapi.testclient import TestClient

from src.main import app


def test_ready_returns_ok_when_postgres_and_redis_ping(monkeypatch) -> None:
    monkeypatch.setattr("src.main.app_config.postgres.url", "postgresql://ok")
    monkeypatch.setattr("src.main.app_config.redis.url", "redis://ok")
    monkeypatch.setattr("src.main.ping_postgres", lambda url: None)
    monkeypatch.setattr("src.main.ping_redis", lambda url: None)

    response = TestClient(app).get("/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "postgres": "ok",
        "redis": "ok",
    }


def test_ready_returns_503_when_url_missing(monkeypatch) -> None:
    monkeypatch.setattr("src.main.app_config.postgres.url", None)
    monkeypatch.setattr("src.main.app_config.redis.url", "redis://ok")
    monkeypatch.setattr("src.main.ping_redis", lambda url: None)

    response = TestClient(app).get("/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "postgres": "unconfigured",
        "redis": "ok",
    }


def test_ready_returns_503_when_url_blank(monkeypatch) -> None:
    monkeypatch.setattr("src.main.app_config.postgres.url", "")
    monkeypatch.setattr("src.main.app_config.redis.url", "   ")
    monkeypatch.setattr("src.main.ping_postgres", lambda url: None)
    monkeypatch.setattr("src.main.ping_redis", lambda url: None)

    response = TestClient(app).get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["postgres"] == "unconfigured"
    assert body["redis"] == "unconfigured"


def test_ready_returns_503_when_postgres_down(monkeypatch) -> None:
    def fail(_url: str) -> None:
        raise RuntimeError("down")

    monkeypatch.setattr("src.main.app_config.postgres.url", "postgresql://down")
    monkeypatch.setattr("src.main.app_config.redis.url", "redis://ok")
    monkeypatch.setattr("src.main.ping_postgres", fail)
    monkeypatch.setattr("src.main.ping_redis", lambda url: None)

    response = TestClient(app).get("/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "postgres": "unavailable",
        "redis": "ok",
    }


def test_ready_returns_503_when_redis_down(monkeypatch) -> None:
    def fail(_url: str) -> None:
        raise RuntimeError("down")

    monkeypatch.setattr("src.main.app_config.postgres.url", "postgresql://ok")
    monkeypatch.setattr("src.main.app_config.redis.url", "redis://down")
    monkeypatch.setattr("src.main.ping_postgres", lambda url: None)
    monkeypatch.setattr("src.main.ping_redis", fail)

    response = TestClient(app).get("/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "postgres": "ok",
        "redis": "unavailable",
    }


def test_health_stays_ok_when_not_ready(monkeypatch) -> None:
    monkeypatch.setattr("src.main.app_config.postgres.url", None)
    monkeypatch.setattr("src.main.app_config.redis.url", None)

    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ai_has_no_invoice_or_expense_routes() -> None:
    paths = [getattr(route, "path", "") for route in app.routes]
    assert all("invoice" not in path and "expense" not in path for path in paths)
