import asyncio
import re
import uuid
from datetime import timedelta
from pathlib import Path

import pytest

from app.api.deps import get_media_service
from app.core.config import get_settings
from app.main import create_app
from app.models.job import utcnow
from tests.conftest import wait_for_job
from tests.fakes import FAKE_BYTES

URL = "https://fake.test/media/song1"


def assert_error(response, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message"}
    assert body["error"]["code"] == code
    assert body["error"]["message"]


def work_dir(app) -> Path:
    return app.state.settings.temp_dir


# --- health, auth, validation -------------------------------------------------------------


async def test_health_needs_no_auth(client):
    r = await client.get("/health", headers={"X-API-Key": ""})
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "providers": ["fake"]}
    assert r.headers["x-request-id"]


@pytest.mark.parametrize("headers", [{}, {"X-API-Key": "wrong"}, {"X-API-Key": ""}])
async def test_auth_required(client, headers):
    client.headers.pop("X-API-Key")
    r = await client.post("/api/media/metadata", json={"url": URL}, headers=headers)
    assert_error(r, 401, "unauthorized")


async def test_auth_required_on_all_routes(client):
    client.headers.pop("X-API-Key")
    jid = str(uuid.uuid4())
    for method, path in [
        ("POST", "/api/media/download"),
        ("GET", f"/api/media/jobs/{jid}"),
        ("GET", f"/api/media/jobs/{jid}/file?token=x"),
        ("DELETE", f"/api/media/jobs/{jid}"),
    ]:
        assert_error(await client.request(method, path), 401, "unauthorized")


async def test_validation_error_shape(client):
    r = await client.post("/api/media/metadata", json={"nope": 1})
    assert_error(r, 422, "invalid_request")
    r = await client.post("/api/media/metadata", json={"url": "https://fake.test/" + "a" * 2100})
    assert_error(r, 422, "invalid_request")
    r = await client.post("/api/media/download", json={"url": URL, "format": "wav"})
    assert_error(r, 422, "invalid_request")


async def test_unknown_route_uses_error_shape(client):
    assert_error(await client.get("/nope"), 404, "not_found")


async def test_unhandled_exception_is_masked(app, client):
    async def boom():
        raise RuntimeError("secret internals")

    app.dependency_overrides[get_media_service] = boom
    r = await client.post("/api/media/metadata", json={"url": URL})
    assert_error(r, 500, "internal_error")
    assert "secret" not in r.text


# --- metadata -----------------------------------------------------------------------------


async def test_metadata_happy_path(client):
    r = await client.post("/api/media/metadata", json={"url": URL})
    assert r.status_code == 200
    assert r.json() == {
        "provider": "fake",
        "sourceId": "song1",
        "sourceUrl": URL,
        "title": "Title song1",
        "creator": "Fake Creator",
        "thumbnail": "https://fake.test/thumb.jpg",
        "duration": 120,
    }


@pytest.mark.parametrize(
    ("url", "status", "code"),
    [
        ("https://example.com/video", 422, "unsupported_url"),
        ("javascript:alert(1)", 422, "invalid_url"),
        ("https://user:pw@fake.test/media/x", 422, "invalid_url"),
        ("https://fake.test/media/private", 403, "private_media"),
        ("https://fake.test/media/gone", 404, "unavailable_media"),
        ("https://fake.test/media/live", 422, "unsupported_media"),
        ("https://fake.test/media/long", 422, "media_too_long"),
    ],
)
async def test_metadata_errors(client, url, status, code):
    assert_error(await client.post("/api/media/metadata", json={"url": url}), status, code)


async def test_private_message_is_friendly(client):
    r = await client.post("/api/media/metadata", json={"url": "https://fake.test/media/private"})
    assert r.json()["error"]["message"] == "This media is private."


# --- download lifecycle -------------------------------------------------------------------


async def test_download_lifecycle(app, client):
    r = await client.post("/api/media/download", json={"url": URL, "format": "mp3"})
    assert r.status_code == 202
    body = r.json()
    assert set(body) == {"jobId", "status", "progress", "stage", "downloadToken", "metadata"}
    assert body["metadata"]["title"] == "Title song1"
    job_id, token = body["jobId"], body["downloadToken"]

    done = await wait_for_job(client, job_id, "complete", "failed")
    assert done["status"] == "complete"
    assert done["stage"] == "ready"
    assert done["progress"] == 100
    assert done["error"] is None
    assert done["fileSize"] == len(FAKE_BYTES)
    assert done["expiresAt"]

    file_url = f"/api/media/jobs/{job_id}/file"
    assert_error(await client.get(file_url), 403, "invalid_token")
    assert_error(await client.get(file_url, params={"token": "wrong"}), 403, "invalid_token")
    client_key = client.headers.pop("X-API-Key")
    assert_error(await client.get(file_url, params={"token": token}), 401, "unauthorized")
    client.headers["X-API-Key"] = client_key

    r = await client.get(file_url, params={"token": token})
    assert r.status_code == 200
    assert r.content == FAKE_BYTES
    assert r.headers["content-type"] == "audio/mpeg"
    assert r.headers["content-length"] == str(len(FAKE_BYTES))
    disposition = r.headers["content-disposition"]
    assert f"{job_id}.mp3" in disposition
    assert "song1" not in disposition  # never the title

    # Not deleted on send; still downloadable until acknowledged.
    mp3 = work_dir(app) / job_id / f"{job_id}.mp3"
    assert mp3.exists()
    assert (await client.get(file_url, params={"token": token})).status_code == 200


async def test_file_before_complete_is_409(make_harness):
    h = await make_harness()
    r = await h.client.post("/api/media/download", json={"url": "https://fake.test/media/slow1"})
    body = r.json()
    status = await h.client.get(f"/api/media/jobs/{body['jobId']}")
    assert status.json()["status"] in ("queued", "processing")
    r = await h.client.get(
        f"/api/media/jobs/{body['jobId']}/file", params={"token": body["downloadToken"]}
    )
    assert_error(r, 409, "job_not_ready")
    await h.client.delete(f"/api/media/jobs/{body['jobId']}")


async def test_delete_acknowledges_and_removes_file(app, client):
    body = (await client.post("/api/media/download", json={"url": URL})).json()
    job_id = body["jobId"]
    await wait_for_job(client, job_id, "complete")
    mp3 = work_dir(app) / job_id / f"{job_id}.mp3"
    assert mp3.exists()

    assert (await client.delete(f"/api/media/jobs/{job_id}")).status_code == 204
    assert not mp3.exists()
    assert not (work_dir(app) / job_id).exists()
    assert_error(await client.get(f"/api/media/jobs/{job_id}"), 404, "job_not_found")
    # idempotent, including for unknown and malformed ids
    assert (await client.delete(f"/api/media/jobs/{job_id}")).status_code == 204
    assert (await client.delete(f"/api/media/jobs/{uuid.uuid4()}")).status_code == 204
    assert (await client.delete("/api/media/jobs/not-a-uuid")).status_code == 204


async def test_job_id_validation(client):
    assert_error(await client.get("/api/media/jobs/not-a-uuid"), 404, "job_not_found")
    assert_error(await client.get(f"/api/media/jobs/{uuid.uuid4()}"), 404, "job_not_found")
    r = await client.get(f"/api/media/jobs/{uuid.uuid4()}/file", params={"token": "x"})
    assert_error(r, 404, "job_not_found")


async def test_failed_job_reports_error(client):
    body = (
        await client.post("/api/media/download", json={"url": "https://fake.test/media/broken"})
    ).json()
    done = await wait_for_job(client, body["jobId"], "failed")
    assert done["stage"] == "failed"
    assert done["error"]["code"] == "conversion_failed"
    assert done["expiresAt"]


async def test_duplicate_submit_returns_same_job(app, client):
    first = (await client.post("/api/media/download", json={"url": URL})).json()
    # Different URL spelling, same source id -> same job (active or complete)
    again = (await client.post("/api/media/download", json={"url": URL})).json()
    assert again["jobId"] == first["jobId"]
    assert again["downloadToken"] == first["downloadToken"]
    await wait_for_job(client, first["jobId"], "complete")
    third = (await client.post("/api/media/download", json={"url": URL})).json()
    assert third["jobId"] == first["jobId"]
    assert third["status"] == "complete"
    assert len(list(work_dir(app).iterdir())) == 1


async def test_queue_full_returns_503(make_harness):
    h = await make_harness(env={"MAX_CONCURRENT_JOBS": "1", "MAX_QUEUED_JOBS": "1"})
    c = h.client
    ids = []
    for n in (1, 2):
        r = await c.post("/api/media/download", json={"url": f"https://fake.test/media/slow{n}"})
        assert r.status_code == 202
        ids.append(r.json()["jobId"])
        await asyncio.sleep(0.05)  # let the first job leave the queue
    r = await c.post("/api/media/download", json={"url": "https://fake.test/media/slow3"})
    assert_error(r, 503, "server_busy")
    for job_id in ids:
        await c.delete(f"/api/media/jobs/{job_id}")


async def test_cancellation_via_delete(make_harness):
    h = await make_harness()
    c = h.client
    body = (
        await c.post("/api/media/download", json={"url": "https://fake.test/media/slow1"})
    ).json()
    job_id = body["jobId"]
    await wait_for_job(c, job_id, "processing")
    job = h.app.state.media_service.get_job(job_id)
    assert (work_dir(h.app) / job_id).exists()
    assert (await c.delete(f"/api/media/jobs/{job_id}")).status_code == 204
    assert job.cancel_event.is_set()
    assert_error(await c.get(f"/api/media/jobs/{job_id}"), 404, "job_not_found")
    async with asyncio.timeout(3):
        while job.status.value == "processing":
            await asyncio.sleep(0.01)
    assert job.stage.value == "cancelled"
    assert not (work_dir(h.app) / job_id).exists()


async def test_job_timeout(make_harness):
    h = await make_harness(env={"JOB_TIMEOUT_SECONDS": "0.2"})
    body = (
        await h.client.post("/api/media/download", json={"url": "https://fake.test/media/slow1"})
    ).json()
    done = await wait_for_job(h.client, body["jobId"], "failed")
    assert done["error"]["code"] == "timeout"
    assert done["stage"] == "failed"


async def test_expiry_cleanup_deletes_files(app, client):
    body = (await client.post("/api/media/download", json={"url": URL})).json()
    job_id = body["jobId"]
    await wait_for_job(client, job_id, "complete")
    job_path = work_dir(app) / job_id
    assert job_path.exists()
    store = app.state.media_service.store
    assert store.expire(utcnow()) == []  # not yet expired
    ttl = get_settings().job_ttl_seconds
    assert store.expire(utcnow() + timedelta(seconds=ttl + 5)) == [job_id]
    assert not job_path.exists()
    assert_error(await client.get(f"/api/media/jobs/{job_id}"), 404, "job_not_found")


async def test_file_expired_when_file_gone(app, client):
    body = (await client.post("/api/media/download", json={"url": URL})).json()
    job_id = body["jobId"]
    await wait_for_job(client, job_id, "complete")
    (work_dir(app) / job_id / f"{job_id}.mp3").unlink()
    r = await client.get(f"/api/media/jobs/{job_id}/file", params={"token": body["downloadToken"]})
    assert_error(r, 410, "file_expired")


async def test_startup_purges_temp_dir(make_harness, tmp_path):
    stale = tmp_path / "work" / "stale"
    stale.mkdir(parents=True)
    (stale / "old.mp3").write_bytes(b"x")
    h = await make_harness()
    assert not stale.exists()
    assert work_dir(h.app).exists()


# --- request limits -----------------------------------------------------------------------


async def test_large_body_rejected_with_413(client):
    r = await client.post("/api/media/metadata", content=b"x" * 5000)
    assert_error(r, 413, "payload_too_large")


async def test_large_chunked_body_rejected_with_413(client):
    async def chunks():
        for _ in range(10):
            yield b"x" * 1000

    r = await client.post("/api/media/metadata", content=chunks())
    assert_error(r, 413, "payload_too_large")


async def test_rate_limit_returns_429(make_harness):
    h = await make_harness(env={"METADATA_RATE_LIMIT": "2/minute"})
    for _ in range(2):
        assert (await h.client.post("/api/media/metadata", json={"url": URL})).status_code == 200
    r = await h.client.post("/api/media/metadata", json={"url": URL})
    assert_error(r, 429, "rate_limited")
    assert int(r.headers["retry-after"]) > 0
    # download limit is tracked separately
    assert (await h.client.post("/api/media/download", json={"url": URL})).status_code == 202


# --- config -------------------------------------------------------------------------------


async def test_startup_fails_without_api_key(monkeypatch, tmp_path):
    monkeypatch.delenv("API_KEY")
    monkeypatch.chdir(tmp_path)  # no stray .env
    get_settings.cache_clear()
    app = create_app()
    with pytest.raises(RuntimeError, match=r"API_KEY.*must be set"):
        async with app.router.lifespan_context(app):
            pass


async def test_access_log_omits_query_string(client, caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="app.access"):
        await client.get("/health?token=supersecret")
    records = [r for r in caplog.records if r.name == "app.access"]
    assert records
    rec = records[-1]
    assert rec.path == "/health"
    assert rec.status == 200
    assert all("supersecret" not in str(r.__dict__) for r in records)
    assert re.fullmatch(r"[0-9a-f]{32}", rec.request_id)
