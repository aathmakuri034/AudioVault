import uuid

import pytest

from app.utils.files import UnsafePathError, ensure_within, job_dir, purge_dir, safe_delete_tree


def test_ensure_within_blocks_escape(tmp_path):
    with pytest.raises(UnsafePathError):
        ensure_within(tmp_path, tmp_path / ".." / "x")
    with pytest.raises(UnsafePathError):
        ensure_within(tmp_path, tmp_path)


def test_job_dir_requires_uuid(tmp_path):
    jid = str(uuid.uuid4())
    assert job_dir(tmp_path, jid) == (tmp_path / jid).resolve()
    with pytest.raises(ValueError):
        job_dir(tmp_path, "../etc")


def test_safe_delete_and_purge(tmp_path):
    d = tmp_path / "a"
    d.mkdir()
    (d / "f.mp3").write_bytes(b"x")
    assert safe_delete_tree(tmp_path, d)
    assert not d.exists()
    assert not safe_delete_tree(tmp_path, tmp_path.parent)


def test_purge_only_removes_job_directories(tmp_path):
    stale = tmp_path / str(uuid.uuid4())
    stale.mkdir()
    (stale / "x.mp3").write_bytes(b"x")
    (tmp_path / "not-a-job").mkdir()
    (tmp_path / "keep.txt").write_text("x")
    purge_dir(tmp_path)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["keep.txt", "not-a-job"]


def test_purge_creates_missing_dir(tmp_path):
    target = tmp_path / "new"
    purge_dir(target)
    assert target.is_dir()
