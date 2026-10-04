"""Orchestration used by the routes: resolve provider, create/reuse jobs, serve files."""

import logging
import uuid
from datetime import datetime
from pathlib import Path

from app.core.config import Settings
from app.core.errors import FileExpired, InvalidToken, JobNotFound, JobNotReady
from app.core.security import generate_download_token, secrets_match
from app.models.job import Job, JobStatus, utcnow
from app.providers.base import MediaMetadata, MediaTooLong
from app.providers.registry import ProviderRegistry
from app.services.media.job_runner import JobRunner
from app.services.media.job_store import JobStore
from app.utils.files import UnsafePathError, ensure_within

logger = logging.getLogger(__name__)


class MediaService:
    def __init__(
        self,
        settings: Settings,
        registry: ProviderRegistry,
        store: JobStore,
        runner: JobRunner,
    ) -> None:
        self._settings = settings
        self.registry = registry
        self.store = store
        self._runner = runner

    async def get_metadata(self, url: str) -> MediaMetadata:
        provider, canonical = self.registry.resolve(url)
        return await provider.get_metadata(canonical)

    async def start_download(self, url: str) -> Job:
        provider, canonical = self.registry.resolve(url)
        metadata = await provider.get_metadata(canonical)
        limit = self._settings.max_duration_seconds
        if metadata.duration_seconds is not None and metadata.duration_seconds > limit:
            raise MediaTooLong(f"This media is longer than {limit // 60} minutes.")
        # No awaits from here on, so the duplicate check and the insert are atomic.
        existing = self.store.find_reusable(provider.name, metadata.source_id)
        if existing is not None:
            return existing
        job = Job(
            provider=provider.name,
            canonical_url=metadata.source_url,
            source_id=metadata.source_id,
            metadata=metadata,
            download_token=generate_download_token(),
        )
        self.store.add(job)
        try:
            self._runner.submit(job)
        except Exception:
            self.store.delete(job.id)
            raise
        logger.info("job queued", extra={"job_id": job.id, "provider": provider.name})
        return job

    def get_job(self, job_id: str) -> Job:
        try:
            key = str(uuid.UUID(job_id))
        except ValueError:
            raise JobNotFound() from None
        job = self.store.get(key)
        if job is None:
            raise JobNotFound()
        return job

    def expires_at(self, job: Job) -> datetime | None:
        return self.store.expires_at(job)

    def get_file(self, job_id: str, token: str | None) -> tuple[Job, Path]:
        job = self.get_job(job_id)
        if not secrets_match(token, job.download_token):
            raise InvalidToken()
        if job.status != JobStatus.COMPLETE:
            raise JobNotReady()
        if self.store.is_expired(job, utcnow()) or job.file_path is None:
            raise FileExpired()
        try:
            path = ensure_within(self._settings.temp_dir, job.file_path)
        except UnsafePathError:
            raise FileExpired() from None
        if not path.is_file():
            raise FileExpired()
        return job, path

    def delete_job(self, job_id: str) -> None:
        """Acknowledge or cancel. Idempotent: unknown ids are ignored."""
        try:
            key = str(uuid.UUID(job_id))
        except ValueError:
            return
        self.store.delete(key)
