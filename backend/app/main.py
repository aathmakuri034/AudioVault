"""Application factory."""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import ValidationError

from app.api.routes import health, media
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import BodySizeLimitMiddleware, RequestContextMiddleware
from app.core.rate_limit import limiter
from app.providers.registry import ProviderRegistry
from app.services.media.job_runner import JobRunner, run_cleanup_loop
from app.services.media.job_store import JobStore
from app.services.media.media_service import MediaService
from app.utils.files import purge_dir

logger = logging.getLogger(__name__)

CLEANUP_INTERVAL_SECONDS = 60


def create_app(registry: ProviderRegistry | None = None) -> FastAPI:
    """Build the app. ``registry`` lets tests inject providers; otherwise built from settings."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            settings = get_settings()
        except ValidationError as exc:
            problems = "; ".join(
                f"{'.'.join(str(p) for p in e['loc']).upper()}: {e['msg']}" for e in exc.errors()
            )
            raise RuntimeError(f"Invalid configuration: {problems}") from None
        configure_logging(settings.log_level)
        purge_dir(settings.temp_dir)  # also creates it; stale files never survive a restart
        providers = registry or ProviderRegistry.from_settings(settings)
        store = JobStore(settings.temp_dir, settings.job_ttl_seconds, settings.job_timeout_seconds)
        runner = JobRunner(
            providers,
            settings.temp_dir,
            settings.max_concurrent_jobs,
            settings.max_queued_jobs,
            settings.job_timeout_seconds,
        )
        app.state.settings = settings
        app.state.media_service = MediaService(settings, providers, store, runner)
        await runner.start()
        cleanup = asyncio.create_task(run_cleanup_loop(store, CLEANUP_INTERVAL_SECONDS))
        logger.info("started", extra={"providers": providers.names})
        try:
            yield
        finally:
            cleanup.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await cleanup
            await runner.stop()

    app = FastAPI(
        title="AudioVault media API",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.limiter = limiter
    register_exception_handlers(app)
    # Last added is outermost: the access log wraps everything, including 413 rejections.
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(RequestContextMiddleware)
    app.include_router(health.router)
    app.include_router(media.router)
    return app


app = create_app()
