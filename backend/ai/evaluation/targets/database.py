from urllib.parse import urlsplit

LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1")


def require_local_database(*urls: str | None) -> None:
    """Refuses a remote database, so a run never scores or writes real shops."""
    for url in urls:
        if urlsplit(url or "").hostname not in LOCAL_HOSTS:
            raise SystemExit("evaluation runs on the local database only")
