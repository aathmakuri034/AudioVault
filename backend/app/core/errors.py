"""Error hierarchy and the single client-facing error contract.

Every error response looks like ``{"error": {"code": "<snake_code>", "message": "<safe text>"}}``.
Stack traces and raw third-party output are logged server-side only.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base class for errors that are safe to show to clients."""

    code: str = "internal_error"
    status_code: int = 500
    default_message: str = "Something went wrong."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status_code: int | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.message = message or self.default_message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        self.headers = headers
        super().__init__(self.message)


class InvalidUrl(AppError):
    code = "invalid_url"
    status_code = 422
    default_message = "Unable to process this URL."


class UnsupportedUrl(AppError):
    code = "unsupported_url"
    status_code = 422
    default_message = "This link is not supported."


class JobNotFound(AppError):
    code = "job_not_found"
    status_code = 404
    default_message = "Download job not found."


class JobNotReady(AppError):
    code = "job_not_ready"
    status_code = 409
    default_message = "This download is not ready yet."


class FileExpired(AppError):
    code = "file_expired"
    status_code = 410
    default_message = "This file is no longer available."


class InvalidToken(AppError):
    code = "invalid_token"
    status_code = 403
    default_message = "Invalid download token."


class Unauthorized(AppError):
    code = "unauthorized"
    status_code = 401
    default_message = "Missing or invalid API key."


class PayloadTooLarge(AppError):
    code = "payload_too_large"
    status_code = 413
    default_message = "Request body is too large."


class RateLimited(AppError):
    code = "rate_limited"
    status_code = 429
    default_message = "Too many requests. Please slow down."


class ServerBusy(AppError):
    code = "server_busy"
    status_code = 503
    default_message = "The server is busy. Please try again shortly."


class JobTimeout(AppError):
    code = "timeout"
    status_code = 504
    default_message = "The download took too long and was stopped."


def error_body(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


def error_response(
    code: str, message: str, status_code: int, headers: dict[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(error_body(code, message), status_code=status_code, headers=headers)


async def _app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    if exc.status_code >= 500:
        logger.error("app error", extra={"code": exc.code, "path": request.url.path})
    return error_response(exc.code, exc.message, exc.status_code, exc.headers)


async def _validation_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return error_response("invalid_request", "The request is invalid.", 422)


async def _http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    mapping = {404: "not_found", 405: "method_not_allowed"}
    code = mapping.get(exc.status_code, "http_error")
    message = "Resource not found." if exc.status_code == 404 else "Request could not be handled."
    return error_response(code, message, exc.status_code)


async def _rate_limit_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RateLimitExceeded)
    headers: dict[str, str] = {}
    limit = getattr(exc, "limit", None)
    window = getattr(getattr(limit, "limit", None), "get_expiry", None)
    if callable(window):
        headers["Retry-After"] = str(int(window()))
    err = RateLimited()
    return error_response(err.code, err.message, err.status_code, headers or None)


async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled exception", exc_info=exc, extra={"path": request.url.path})
    return error_response("internal_error", "An unexpected error occurred.", 500)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_handler)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
    app.add_exception_handler(Exception, _unhandled_handler)
