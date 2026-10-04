"""API-key authentication and download-token helpers."""

import hmac
import secrets
from typing import Annotated

from fastapi import Header, Request

from app.core.errors import Unauthorized


def generate_download_token() -> str:
    return secrets.token_urlsafe(32)


def secrets_match(provided: str | None, expected: str) -> bool:
    """Constant-time string comparison that tolerates ``None`` and non-ASCII input."""
    if not provided:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


async def require_api_key(
    request: Request,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> None:
    if not secrets_match(x_api_key, request.app.state.settings.api_key):
        raise Unauthorized()
