"""Pure-ASGI middleware: request id + JSON access log, and request body size limit.

The access log records the path only (never the query string) so download tokens
are not written to logs. Headers are never logged.
"""

import logging
import re
import time
import uuid
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import PayloadTooLarge, error_response

logger = logging.getLogger("app.access")

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
_DEFAULT_MAX_BYTES = 4096


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return None


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        supplied = _header(scope, b"x-request-id")
        request_id = supplied if supplied and _REQUEST_ID_RE.match(supplied) else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        started = time.perf_counter()
        status = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode("ascii")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            logger.info(
                "request",
                extra={
                    "request_id": request_id,
                    "method": scope["method"],
                    "path": scope["path"],
                    "status": status,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )


class BodySizeLimitMiddleware:
    """Reject bodies over ``MAX_REQUEST_BYTES`` (declared or streamed) with 413."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    @staticmethod
    def _limit(scope: Scope) -> int:
        app: Any = scope.get("app")
        settings = getattr(getattr(app, "state", None), "settings", None)
        return settings.max_request_bytes if settings else _DEFAULT_MAX_BYTES

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self._limit(scope)
        err = PayloadTooLarge()
        response = error_response(err.code, err.message, err.status_code)

        declared = _header(scope, b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await response(scope, receive, send)
            return

        received = 0
        rejected = False

        async def limited_receive() -> Message:
            nonlocal received, rejected
            message = await receive()
            if message["type"] == "http.request" and not rejected:
                received += len(message.get("body", b""))
                if received > limit:
                    rejected = True
                    await response(scope, receive, send)
            if rejected:
                return {"type": "http.disconnect"}
            return message

        async def guarded_send(message: Message) -> None:
            if not rejected:  # drop whatever the app tries to say after our 413
                await send(message)

        await self.app(scope, limited_receive, guarded_send)
