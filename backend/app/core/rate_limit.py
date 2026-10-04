"""slowapi limiter. Limit strings are read from settings on every request."""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

limiter = Limiter(key_func=get_remote_address)


def metadata_limit() -> str:
    return get_settings().metadata_rate_limit


def download_limit() -> str:
    return get_settings().download_rate_limit
