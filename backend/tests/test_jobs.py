import asyncio
import uuid
from datetime import timedelta

import pytest

from app.core.errors import ServerBusy
from app.models.job import Job, JobStage, JobStatus, utcnow
from app.providers.base import MediaMetadata
from app.providers.registry import ProviderRegistry
from app.services.media.job_runner import JobRunner
from app.services.media.job_store import JobStore
from tests.fakes import FakeProvider


def make_job(media_id: str = "a") -> Job:
    url = f"https://fake.test/media/{media_id}"
    meta = MediaMetadata("fake", media_id, url, "t", "c", None, 10)
    return Job("fake", url, media_id, meta, "token")


async def wait_for_status(job: Job, *statuses: JobStatus, timeout: float = 3) -> None:
    async with asyncio.timeout(timeout):
        while job.status not in statuses:
            await asyncio.sleep(0.005)


def make_runner(tmp_path, **kw) -> tuple[JobRunner, JobStore]:
    registry = ProviderRegistry([FakeProvider()])
    store = JobStore(tmp_path, ttl_seconds=kw.pop("ttl", 1800), timeout_seconds=600)
    runner = JobRunner(
        registry,
        tmp_path,
        max_concurrent=kw.pop("concurrent", 2),
        max_queued=kw.pop("queued", 20),
        job_timeout=kw.pop("timeout", 5),
    )
    return runner, store


def test_store_find_and_delete(tmp_path):
    store = JobStore(tmp_path, 60, 60)
    job = make_job()
    store.add(job)
    assert store.get(job.id) is job
    assert store.find_active_by_source("fake", "a") is job
    assert store.find_active_by_source("fake", "b") is None
    d = tmp_path / job.id
    d.mkdir()
    (d / f"{job.id}.mp3").write_bytes(b"x")
    assert store.delete(job.id)
    assert job.cancel_event.is_set()
    assert not d.exists()
    assert store.get(job.id) is None
    assert not store.delete(str(uuid.uuid4()))


def test_store_expire_removes_files(tmp_path):
    store = JobStore(tmp_path, ttl_seconds=60, timeout_seconds=60)
    old, fresh = make_job("old"), make_job("fresh")
    for job in (old, fresh):
        d = tmp_path / job.id
        d.mkdir()
        f = d / f"{job.id}.mp3"
        f.write_bytes(b"x")
        job.mark_complete(f, 1)
        store.add(job)
    now = utcnow()
    old.finished_at = now - timedelta(seconds=120)
    assert store.expire(now) == [old.id]
    assert not (tmp_path / old.id).exists()
    assert (tmp_path / fresh.id).exists()
    assert store.find_reusable("fake", "old") is None
    assert store.find_reusable("fake", "fresh") is fresh


def test_store_expire_stuck_processing(tmp_path):
    store = JobStore(tmp_path, ttl_seconds=60, timeout_seconds=10)
    job = make_job()
    job.mark_processing()
    job.started_at = utcnow() - timedelta(seconds=300)
    store.add(job)
    assert store.expire() == [job.id]
    assert job.cancel_event.is_set()


async def test_runner_completes_job(tmp_path):
    runner, store = make_runner(tmp_path)
    await runner.start()
    try:
        job = make_job()
        store.add(job)
        runner.submit(job)
        await wait_for_status(job, JobStatus.COMPLETE, JobStatus.FAILED)
        assert job.status == JobStatus.COMPLETE
        assert job.stage == JobStage.READY
        assert job.progress == 100
        assert job.file_path == (tmp_path / job.id / f"{job.id}.mp3").resolve()
        assert job.file_size and job.file_size > 0
    finally:
        await runner.stop()


async def test_runner_maps_provider_error(tmp_path):
    runner, store = make_runner(tmp_path)
    await runner.start()
    try:
        job = make_job("broken")
        store.add(job)
        runner.submit(job)
        await wait_for_status(job, JobStatus.FAILED)
        assert job.error_code == "conversion_failed"
        assert job.stage == JobStage.FAILED
    finally:
        await runner.stop()


async def test_runner_timeout(tmp_path):
    runner, store = make_runner(tmp_path, timeout=0.1)
    await runner.start()
    try:
        job = make_job("slow1")
        store.add(job)
        runner.submit(job)
        await wait_for_status(job, JobStatus.FAILED)
        assert job.error_code == "timeout"
        assert job.cancel_event.is_set()
        assert not (tmp_path / job.id).exists()
    finally:
        await runner.stop()


async def test_runner_cancel_running_and_queued(tmp_path):
    runner, store = make_runner(tmp_path, concurrent=1)
    await runner.start()
    try:
        running, queued = make_job("slow1"), make_job("slow2")
        for j in (running, queued):
            store.add(j)
            runner.submit(j)
        await asyncio.sleep(0.05)
        assert running.status == JobStatus.PROCESSING
        assert queued.status == JobStatus.QUEUED
        store.delete(queued.id)
        store.delete(running.id)
        await wait_for_status(running, JobStatus.FAILED)
        assert running.stage == JobStage.CANCELLED
        await asyncio.sleep(0.05)
        assert queued.status == JobStatus.QUEUED  # skipped by the worker, never started
    finally:
        await runner.stop()


async def test_runner_queue_full(tmp_path):
    runner, store = make_runner(tmp_path, concurrent=1, queued=1)
    await runner.start()
    try:
        first, second, third = make_job("slow1"), make_job("slow2"), make_job("slow3")
        runner.submit(first)
        await asyncio.sleep(0.05)  # first leaves the queue and starts running
        runner.submit(second)
        with pytest.raises(ServerBusy):
            runner.submit(third)
        for j in (first, second, third):
            j.cancel_event.set()
    finally:
        await runner.stop()
