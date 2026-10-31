from fastapi.testclient import TestClient

from src.main import app


def test_metrics_count_requests_by_route_and_status_class() -> None:
    client = TestClient(app)
    client.get(
        "/internal/v1/agent/conversations", headers={"X-Internal-Token": "wrong"}
    )

    body = client.get("/metrics").text

    assert (
        'http_requests_total{handler="/internal/v1/agent/conversations",'
        'method="GET",status="4xx"}'
    ) in body
    # Chat turns last tens of seconds, so the latency buckets must reach past a minute.
    assert (
        'http_request_duration_seconds_bucket{handler="/internal/v1/agent/conversations",le="120.0"'
        in body
    )


def test_metrics_leave_out_health_and_metrics_requests() -> None:
    client = TestClient(app)
    client.get("/health")

    body = client.get("/metrics").text

    assert 'handler="/health"' not in body
    assert 'handler="/metrics"' not in body
