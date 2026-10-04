"""Generic URL sanitation shared by all providers. Pure, no network."""

import unicodedata
from urllib.parse import SplitResult, urlsplit

MAX_URL_LENGTH = 2048
_DEFAULT_PORTS = {"http": 80, "https": 443}


class UrlRejected(ValueError):
    """The URL failed generic sanitation."""


def parse_http_url(raw: object) -> SplitResult:
    """Parse ``raw`` and reject anything that is not a plain http(s) URL."""
    if not isinstance(raw, str) or not raw:
        raise UrlRejected("empty url")
    if len(raw) > MAX_URL_LENGTH:
        raise UrlRejected("url too long")
    if any(ch.isspace() or unicodedata.category(ch).startswith("C") for ch in raw):
        raise UrlRejected("whitespace or control characters")
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError as exc:
        raise UrlRejected("malformed url") from exc
    scheme = parts.scheme.lower()
    if scheme not in _DEFAULT_PORTS:
        raise UrlRejected("scheme not allowed")
    if not parts.hostname:
        raise UrlRejected("missing host")
    if "@" in parts.netloc:
        raise UrlRejected("userinfo not allowed")
    if port is not None and port != _DEFAULT_PORTS[scheme]:
        raise UrlRejected("non-standard port")
    return parts
