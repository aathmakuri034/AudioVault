import asyncio
import uuid

import pytest

from app.core.config import Settings
from app.core.errors import FileExpired, InvalidToken, JobNotFound, JobNotReady, ServerBusy
from app.models.job import JobStatus
from app.providers.base import PrivateMedia
from app.providers.registry import ProviderRegistry
from app.schemas.media import DownloadResponse, JobStatusResponse
from app.services.media.job_runner import JobRunner
from app.services.media.job_store import JobStore
from app.services.media.media_service import MediaService
from tests.fakes import FakeProvider
from tests.test_jobs import wait_for_status

URL = "https://fake.test/media/abc"


@pytest.fixture
async def service(tmp_path):
    settings = Settings(_env_file=None, api_key="k", temp_dir=tmp_path, max_concurrent_jobs=1)
    registry = ProviderRegistry([FakeProvider()])
    store = JobStore(tmp_path, 60, 60)
    runner = JobRunner(registry, tmp_path, 1, 1, 5)
    await runner.start()
    yield MediaService(settings, registry, store, runner)
    await runner.stop()


async def test_lifecycle_and_duplicate(service):
    job = await service.start_download(URL)
    assert (await service.start_download(URL)) is job
    with pytest.raises(JobNotReady):
        service.get_file(job.id, job.download_token)
    await wait_for_status(job, JobStatus.COMPLETE)
    assert (await service.start_download(URL)) is job  # complete and unexpired: reused
    _, path = service.get_file(job.id, job.download_token)
    assert path.is_file()
    with pytest.raises(InvalidToken):
        service.get_file(job.id, "nope")
    path.unlink()
    with pytest.raises(FileExpired):
        service.get_file(job.id, job.download_token)
    service.delete_job(job.id)
    service.delete_job(job.id)  # idempotent
    with pytest.raises(JobNotFound):
        service.get_job(job.id)


async def test_errors_and_bad_ids(service):
    with pytest.raises(PrivateMedia):
        await service.start_download("https://fake.test/media/private")
    with pytest.raises(JobNotFound):
        service.get_job("not-a-uuid")
    service.delete_job("not-a-uuid")
    with pytest.raises(JobNotFound):
        service.get_job(str(uuid.uuid4()))


async def test_queue_full_rolls_back_job(service):
    first = await service.start_download("https://fake.test/media/slow1")
    await asyncio.sleep(0.05)
    await service.start_download("https://fake.test/media/slow2")
    with pytest.raises(ServerBusy):
        await service.start_download("https://fake.test/media/slow3")
    assert len(service.store) == 2
    for j in list(service.store._jobs):
        service.delete_job(j)
    assert first.cancel_event.is_set()


async def test_response_models_are_camel_case(service):
    job = await service.start_download(URL)
    body = DownloadResponse.from_job(job).model_dump(by_alias=True, mode="json")
    assert set(body) == {"jobId", "status", "progress", "stage", "downloadToken", "metadata"}
    assert body["metadata"]["sourceId"] == "abc"
    status = JobStatusResponse.from_job(job, None).model_dump(by_alias=True, mode="json")
    assert set(status) == {"jobId", "status", "stage", "progress", "error", "fileSize", "expiresAt"}
    service.delete_job(job.id)
