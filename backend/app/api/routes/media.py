from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import FileResponse

from app.api.deps import MediaServiceDep
from app.core.rate_limit import download_limit, limiter, metadata_limit
from app.core.security import require_api_key
from app.schemas.media import (
    DownloadRequest,
    DownloadResponse,
    JobStatusResponse,
    MetadataRequest,
    MetadataResponse,
)

router = APIRouter(
    prefix="/api/media",
    tags=["media"],
    dependencies=[Depends(require_api_key)],
)


@router.post("/metadata", response_model=MetadataResponse)
@limiter.limit(metadata_limit)
async def get_metadata(
    request: Request, body: MetadataRequest, service: MediaServiceDep
) -> MetadataResponse:
    metadata = await service.get_metadata(body.url)
    return MetadataResponse.from_metadata(metadata)


@router.post("/download", response_model=DownloadResponse, status_code=202)
@limiter.limit(download_limit)
async def start_download(
    request: Request, body: DownloadRequest, service: MediaServiceDep
) -> DownloadResponse:
    job = await service.start_download(body.url)
    return DownloadResponse.from_job(job)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str, service: MediaServiceDep) -> JobStatusResponse:
    job = service.get_job(job_id)
    return JobStatusResponse.from_job(job, service.expires_at(job))


@router.get("/jobs/{job_id}/file")
async def get_file(
    job_id: str,
    service: MediaServiceDep,
    token: Annotated[str | None, Query(max_length=256)] = None,
) -> FileResponse:
    job, path = service.get_file(job_id, token)
    # Filename is the job id, never the (untrusted) title. The file is NOT deleted here:
    # the client acknowledges with DELETE once it has stored the file.
    return FileResponse(path, media_type="audio/mpeg", filename=f"{job.id}.mp3")


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job(job_id: str, service: MediaServiceDep) -> Response:
    service.delete_job(job_id)
    return Response(status_code=204)
