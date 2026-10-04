"""In-memory job store with TTL expiry. Single-process by design (see ARCHITECTURE.md)."""

import logging
from datetime import datetime, timedelta
from pathlib import Path

from app.models.job import Job, JobStatus, utcnow
from app.utils.files import job_dir, safe_delete_tree

logger = logging.getLogger(__name__)

# Backstop only: the runner enforces JOB_TIMEOUT itself; this reaps anything that slipped past.
_STUCK_GRACE = timedelta(seconds=30)


class JobStore:
    def __init__(self, temp_dir: Path, ttl_seconds: float, timeout_seconds: float) -> None:
        self._temp_dir = temp_dir
        self._ttl = timedelta(seconds=ttl_seconds)
        self._timeout = timedelta(seconds=timeout_seconds)
        self._jobs: dict[str, Job] = {}

    def __len__(self) -> int:
        return len(self._jobs)

    def add(self, job: Job) -> None:
        self._jobs[job.id] = job

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def find_active_by_source(self, provider: str, source_id: str) -> Job | None:
        for job in self._jobs.values():
            if job.provider == provider and job.source_id == source_id and job.is_active:
                return job
        return None

    def is_expired(self, job: Job, now: datetime | None = None) -> bool:
        now = now or utcnow()
        return job.finished_at is not None and job.finished_at + self._ttl < now

    def expires_at(self, job: Job) -> datetime | None:
        return job.finished_at + self._ttl if job.finished_at else None

    def find_reusable(self, provider: str, source_id: str) -> Job | None:
        """An active job, or a completed one whose file is still available."""
        active = self.find_active_by_source(provider, source_id)
        if active:
            return active
        now = utcnow()
        for job in self._jobs.values():
            if (
                job.provider == provider
                and job.source_id == source_id
                and job.status == JobStatus.COMPLETE
                and not self.is_expired(job, now)
                and job.file_path is not None
                and job.file_path.is_file()
            ):
                return job
        return None

    def _remove_files(self, job: Job) -> None:
        safe_delete_tree(self._temp_dir, job_dir(self._temp_dir, job.id))

    def delete(self, job_id: str) -> bool:
        """Cancel (if running), delete files and forget the job. Returns whether it existed."""
        job = self._jobs.pop(job_id, None)
        if job is None:
            return False
        job.cancel_event.set()
        self._remove_files(job)
        return True

    def expire(self, now: datetime | None = None) -> list[str]:
        """Drop expired and stuck jobs along with their files. Returns removed job ids."""
        now = now or utcnow()
        removed: list[str] = []
        for job in list(self._jobs.values()):
            expired = self.is_expired(job, now)
            stuck = (
                job.status == JobStatus.PROCESSING
                and job.started_at is not None
                and job.started_at + self._timeout + _STUCK_GRACE < now
            )
            if expired or stuck:
                self._jobs.pop(job.id, None)
                job.cancel_event.set()
                self._remove_files(job)
                removed.append(job.id)
        if removed:
            logger.info("expired jobs", extra={"count": len(removed)})
        return removed
