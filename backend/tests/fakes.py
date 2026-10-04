"""Network-free provider used by the test-suite.

Handles ``https://fake.test/media/<id>``. Special ids:
``private``/``gone``/``live``/``long`` fail in get_metadata, ``broken`` fails in extract_audio,
ids starting with ``slow`` run until cancelled or timed out.
"""

import asyncio
import re
import threading
from pathlib import Path

from app.models.job import JobStage
from app.providers.base import (
    ConversionFailed,
    JobCancelled,
    MediaMetadata,
    MediaProvider,
    MediaTooLong,
    PrivateMedia,
    ProgressCallback,
    UnavailableMedia,
    UnsupportedMedia,
)

_URL_RE = re.compile(r"^https://fake\.test/media/([A-Za-z0-9_-]+)$")
FAKE_BYTES = b"ID3" + b"\x00" * 64


class FakeProvider(MediaProvider):
    name = "fake"

    def __init__(self, step_delay: float = 0.0) -> None:
        self.step_delay = step_delay
        self.extract_calls = 0

    def validate_url(self, url: str) -> str | None:
        match = _URL_RE.match(url)
        return f"https://fake.test/media/{match.group(1)}" if match else None

    @staticmethod
    def _id(url: str) -> str:
        return url.rsplit("/", 1)[-1]

    async def get_metadata(self, canonical_url: str) -> MediaMetadata:
        media_id = self._id(canonical_url)
        if media_id == "private":
            raise PrivateMedia()
        if media_id == "gone":
            raise UnavailableMedia()
        if media_id == "live":
            raise UnsupportedMedia()
        if media_id == "long":
            raise MediaTooLong()
        return MediaMetadata(
            provider=self.name,
            source_id=media_id,
            source_url=canonical_url,
            title=f"Title {media_id}",
            creator="Fake Creator",
            thumbnail_url="https://fake.test/thumb.jpg",
            duration_seconds=120,
        )

    async def extract_audio(
        self,
        canonical_url: str,
        dest_dir: Path,
        file_stem: str,
        on_progress: ProgressCallback,
        cancel_event: threading.Event,
    ) -> Path:
        self.extract_calls += 1
        media_id = self._id(canonical_url)
        dest_dir.mkdir(parents=True, exist_ok=True)
        out = dest_dir / f"{file_stem}.mp3"
        if media_id.startswith("slow"):
            out.with_suffix(".part").write_bytes(b"partial")
            for _ in range(3000):
                if cancel_event.is_set():
                    raise JobCancelled()
                on_progress(JobStage.DOWNLOADING, 0.1)
                await asyncio.sleep(0.01)
        if media_id == "broken":
            raise ConversionFailed()
        on_progress(JobStage.DOWNLOADING, 0.5)
        if self.step_delay:
            await asyncio.sleep(self.step_delay)
        on_progress(JobStage.CONVERTING, 0.9)
        out.write_bytes(FAKE_BYTES)
        return out
