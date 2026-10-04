import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AsyncExitStack
from dataclasses import dataclass

import httpx
import pytest
from fastapi import FastAPI

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.main import create_app
from app.providers.base import MediaProvider
from app.providers.registry import ProviderRegistry
from tests.fakes import FakeProvider

API_KEY = "test-key"
HEADERS = {"X-API-Key": API_KEY}


@dataclass
class Harness:
    app: FastAPI
    client: httpx.AsyncClient
    provider: FakeProvider


@pytest.fixture(autouse=True)
def _base_env(monkeypatch, tmp_path):
    """Settings override: test key, per-test temp dir, generous rate limits."""
    monkeypatch.setenv("API_KEY", API_KEY)
    monkeypatch.setenv("TEMP_DIR", str(tmp_path / "work"))
    monkeypatch.setenv("METADATA_RATE_LIMIT", "1000/minute")
    monkeypatch.setenv("DOWNLOAD_RATE_LIMIT", "1000/minute")
    get_settings.cache_clear()
    limiter.reset()
    limiter.enabled = True
    yield
    get_settings.cache_clear()
    limiter.reset()


@pytest.fixture
async def make_harness(monkeypatch) -> AsyncIterator[Callable[..., Awaitable[Harness]]]:
    """Factory: ``await make_harness(env={...}, provider=...)`` starts an app with lifespan."""
    stack = AsyncExitStack()

    async def factory(
        env: dict[str, str] | None = None, provider: MediaProvider | None = None
    ) -> Harness:
        for key, value in (env or {}).items():
            monkeypatch.setenv(key, value)
        get_settings.cache_clear()
        fake = provider or FakeProvider()
        app = create_app(registry=ProviderRegistry([fake]))
        await stack.enter_async_context(app.router.lifespan_context(app))
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        client = await stack.enter_async_context(
            httpx.AsyncClient(transport=transport, base_url="http://test", headers=HEADERS)
        )
        return Harness(app, client, fake)  # type: ignore[arg-type]

    yield factory
    await stack.aclose()


@pytest.fixture
async def harness(make_harness) -> Harness:
    return await make_harness()


@pytest.fixture
def app(harness) -> FastAPI:
    return harness.app


@pytest.fixture
def client(harness) -> httpx.AsyncClient:
    return harness.client


async def wait_for_job(
    client: httpx.AsyncClient, job_id: str, *statuses: str, timeout: float = 3.0
) -> dict:
    """Poll the status endpoint until the job reaches one of ``statuses``."""
    async with asyncio.timeout(timeout):
        while True:
            body = (await client.get(f"/api/media/jobs/{job_id}")).json()
            if body["status"] in statuses:
                return body
            await asyncio.sleep(0.01)
