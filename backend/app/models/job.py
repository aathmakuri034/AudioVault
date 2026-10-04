"""Job domain model."""

import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path

from app.providers.base import MediaMetadata


class JobStatus(StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"


class JobStage(StrEnum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    CONVERTING = "converting"
    READY = "ready"
    FAILED = "failed"
    CANCELLED = "cancelled"


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass
class Job:
    provider: str
    canonical_url: str
    source_id: str
    metadata: MediaMetadata
    download_token: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    status: JobStatus = JobStatus.QUEUED
    stage: JobStage = JobStage.QUEUED
    progress: int = 0
    error_code: str | None = None
    error_message: str | None = None
    file_path: Path | None = None
    file_size: int | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)

    @property
    def is_active(self) -> bool:
        return self.status in (JobStatus.QUEUED, JobStatus.PROCESSING)

    @property
    def is_finished(self) -> bool:
        return not self.is_active

    def mark_processing(self) -> None:
        self.status = JobStatus.PROCESSING
        self.stage = JobStage.DOWNLOADING
        self.started_at = self.updated_at = utcnow()

    def set_progress(self, stage: JobStage, fraction: float) -> None:
        if self.is_finished:
            return
        self.stage = stage
        self.progress = max(self.progress, min(99, int(fraction * 100)))
        self.updated_at = utcnow()

    def mark_complete(self, path: Path, size: int) -> None:
        self.status = JobStatus.COMPLETE
        self.stage = JobStage.READY
        self.progress = 100
        self.file_path = path
        self.file_size = size
        self.finished_at = self.updated_at = utcnow()

    def mark_failed(self, code: str, message: str, stage: JobStage = JobStage.FAILED) -> None:
        self.status = JobStatus.FAILED
        self.stage = stage
        self.error_code = code
        self.error_message = message
        self.finished_at = self.updated_at = utcnow()
