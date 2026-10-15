"""Errors the drafts feature raises; the caller falls back to manual entry on each."""


class CatalogUnavailableError(Exception):
    """The shop catalog could not be read; the caller falls back to manual entry.

    Raised for every database failure, including a timeout, so #3/#60 can map one
    domain error to the Core fallback instead of leaking SQLAlchemy exceptions.
    """


class DraftUnavailableError(Exception):
    """The draft could not be built; the caller falls back to manual entry."""
