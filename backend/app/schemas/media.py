"""Request/response models. JSON is camelCase on the wire."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.models.job import Job, JobStage, JobStatus
from app.providers.base import MediaMetadata


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class MetadataRequest(CamelModel):
    url: str = Field(min_length=1, max_length=2048)


class DownloadRequest(CamelModel):
    url: str = Field(min_length=1, max_length=2048)
    format: Literal["mp3"] = "mp3"


class MetadataResponse(CamelModel):
    provider: str
    source_id: str
    source_url: str
    title: str
    creator: str
    thumbnail: str | None
    duration: int | None

    @classmethod
    def from_metadata(cls, meta: MediaMetadata) -> "MetadataResponse":
        return cls(
            provider=meta.provider,
            source_id=meta.source_id,
            source_url=meta.source_url,
            title=meta.title,
            creator=meta.creator,
            thumbnail=meta.thumbnail_url,
            duration=meta.duration_seconds,
        )


class DownloadResponse(CamelModel):
    job_id: str
    status: JobStatus
    progress: int
    stage: JobStage
    download_token: str
    metadata: MetadataResponse

    @classmethod
    def from_job(cls, job: Job) -> "DownloadResponse":
        return cls(
            job_id=job.id,
            status=job.status,
            progress=job.progress,
            stage=job.stage,
            download_token=job.download_token,
            metadata=MetadataResponse.from_metadata(job.metadata),
        )


class ErrorInfo(CamelModel):
    code: str
    message: str


class JobStatusResponse(CamelModel):
    job_id: str
    status: JobStatus
    stage: JobStage
    progress: int
    error: ErrorInfo | None
    file_size: int | None
    expires_at: datetime | None

    @classmethod
    def from_job(cls, job: Job, expires_at: datetime | None) -> "JobStatusResponse":
        error = (
            ErrorInfo(code=job.error_code, message=job.error_message or "")
            if job.error_code
            else None
        )
        return cls(
            job_id=job.id,
            status=job.status,
            stage=job.stage,
            progress=job.progress,
            error=error,
            file_size=job.file_size,
            expires_at=expires_at,
        )
