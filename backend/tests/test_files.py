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
    (tmp_path / "b").mkdir()
    (tmp_path / "c.txt").write_text("x")
    purge_dir(tmp_path)
    assert list(tmp_path.iterdir()) == []
