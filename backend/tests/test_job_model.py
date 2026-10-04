from pathlib import Path

from app.models.job import Job, JobStage, JobStatus
from app.providers.base import MediaMetadata


def _job() -> Job:
    meta = MediaMetadata("p", "id", "https://x", "t", "c", None, 10)
    return Job("p", "https://x", "id", meta, "tok")


def test_lifecycle_transitions():
    job = _job()
    assert (job.status, job.stage, job.progress) == (JobStatus.QUEUED, JobStage.QUEUED, 0)
    assert job.is_active
    job.mark_processing()
    job.set_progress(JobStage.DOWNLOADING, 0.5)
    job.set_progress(JobStage.DOWNLOADING, 0.2)  # progress never goes backwards
    assert job.progress == 50
    job.mark_complete(Path("x.mp3"), 5)
    assert (job.status, job.stage, job.progress) == (JobStatus.COMPLETE, JobStage.READY, 100)
    assert job.finished_at is not None
    assert job.is_finished
    job.set_progress(JobStage.DOWNLOADING, 0.1)  # ignored once finished
    assert job.stage == JobStage.READY


def test_failure():
    job = _job()
    job.mark_failed("timeout", "slow")
    assert job.status == JobStatus.FAILED
    assert job.error_code == "timeout"
