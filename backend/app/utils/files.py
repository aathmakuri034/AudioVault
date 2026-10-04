"""Safe temp-file helpers. Every path is resolved and checked against the temp root."""

import logging
import shutil
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)


class UnsafePathError(ValueError):
    """A path escaped the temp directory."""


def ensure_within(base: Path, path: Path) -> Path:
    """Return ``path`` resolved, asserting it is strictly inside ``base``."""
    resolved = path.resolve()
    if base.resolve() not in resolved.parents:
        raise UnsafePathError("path escapes temp directory")
    return resolved


def job_dir(base: Path, job_id: str) -> Path:
    """Per-job directory ``base/<uuid>``. ``job_id`` must be a UUID."""
    return ensure_within(base, base / str(uuid.UUID(job_id)))


def safe_delete_tree(base: Path, path: Path | None) -> bool:
    """Delete a file or directory if (and only if) it lives inside ``base``."""
    if path is None:
        return False
    try:
        target = ensure_within(base, path)
    except UnsafePathError:
        logger.error("refusing to delete path outside temp dir")
        return False
    try:
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        else:
            target.unlink(missing_ok=True)
    except OSError:
        logger.warning("failed to delete temp path", exc_info=True)
        return False
    return True


def _is_uuid(name: str) -> bool:
    try:
        return str(uuid.UUID(name)) == name
    except ValueError:
        return False


def purge_dir(path: Path) -> None:
    """Create ``path`` if needed and remove stale job directories inside it.

    Only UUID-named directories (the ones ``job_dir`` creates) are removed, so a
    misconfigured ``TEMP_DIR`` pointing at a real directory can never be wiped.
    """
    path.mkdir(parents=True, exist_ok=True)
    for child in path.iterdir():
        if child.is_dir() and not child.is_symlink() and _is_uuid(child.name):
            shutil.rmtree(child, ignore_errors=True)
