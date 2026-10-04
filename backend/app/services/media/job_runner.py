"""Asyncio job runner: bounded queue, N workers, per-job timeout."""

import asyncio
import logging
from pathlib import Path

from app.core.errors import AppError, JobTimeout, ServerBusy
from app.models.job import Job, JobStage
from app.providers.base import JobCancelled
from app.providers.registry import ProviderRegistry
from app.services.media.job_store import JobStore
from app.utils.files import ensure_within, job_dir, safe_delete_tree

logger = logging.getLogger(__name__)


class JobRunner:
    def __init__(
        self,
        registry: ProviderRegistry,
        temp_dir: Path,
        max_concurrent: int,
        max_queued: int,
        job_timeout: float,
    ) -> None:
        self._registry = registry
        self._temp_dir = temp_dir
        self._max_concurrent = max_concurrent
        self._timeout = job_timeout
        self._queue: asyncio.Queue[Job] = asyncio.Queue(maxsize=max_queued)
        self._workers: list[asyncio.Task[None]] = []

    @property
    def queued(self) -> int:
        return self._queue.qsize()

    async def start(self) -> None:
        if self._workers:
            return
        # One worker per allowed concurrent job: the worker count is the concurrency gate.
        self._workers = [
            asyncio.create_task(self._worker(), name=f"job-worker-{i}")
            for i in range(self._max_concurrent)
        ]

    async def stop(self) -> None:
        for task in self._workers:
            task.cancel()
        await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers = []

    def submit(self, job: Job) -> None:
        try:
            self._queue.put_nowait(job)
        except asyncio.QueueFull as exc:
            raise ServerBusy() from exc

    async def _worker(self) -> None:
        while True:
            job = await self._queue.get()
            try:
                await self._run(job)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("job crashed", extra={"job_id": job.id})
                job.mark_failed("internal_error", "An unexpected error occurred.")
            finally:
                self._queue.task_done()

    def _cleanup(self, job: Job) -> None:
        safe_delete_tree(self._temp_dir, job_dir(self._temp_dir, job.id))

    async def _run(self, job: Job) -> None:
        if job.cancel_event.is_set():  # cancelled/deleted while queued
            return
        job.mark_processing()
        provider = self._registry.get(job.provider)
        dest = job_dir(self._temp_dir, job.id)
        try:
            path = await asyncio.wait_for(
                provider.extract_audio(
                    job.canonical_url, dest, job.id, job.set_progress, job.cancel_event
                ),
                timeout=self._timeout,
            )
            path = ensure_within(self._temp_dir, path)
            if job.cancel_event.is_set():
                raise JobCancelled()
            job.mark_complete(path, path.stat().st_size)
        except TimeoutError:
            job.cancel_event.set()
            err = JobTimeout()
            job.mark_failed(err.code, err.message)
            self._cleanup(job)
        except JobCancelled as exc:
            job.mark_failed(exc.code, exc.message, stage=JobStage.CANCELLED)
            self._cleanup(job)
        except AppError as exc:
            job.mark_failed(exc.code, exc.message)
            self._cleanup(job)
        except asyncio.CancelledError:
            job.cancel_event.set()
            self._cleanup(job)
            raise
        except Exception:
            logger.exception("extract_audio crashed", extra={"job_id": job.id})
            job.mark_failed("internal_error", "An unexpected error occurred.")
            self._cleanup(job)


async def run_cleanup_loop(store: JobStore, interval_seconds: float = 60) -> None:
    """Periodically expire finished/stuck jobs and delete their files."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            store.expire()
        except Exception:
            logger.exception("cleanup loop failed")
