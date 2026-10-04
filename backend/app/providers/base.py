"""Provider abstraction: one ``MediaProvider`` per supported site."""

import threading
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, ClassVar

from app.core.errors import AppError

if TYPE_CHECKING:
    from app.models.job import JobStage


@dataclass(frozen=True)
class MediaMetadata:
    provider: str
    source_id: str
    source_url: str  # canonical URL
    title: str
    creator: str
    thumbnail_url: str | None
    duration_seconds: int | None


class ProviderError(AppError):
    code = "provider_error"
    status_code = 502
    default_message = "The media provider could not complete the request."


class PrivateMedia(ProviderError):
    code = "private_media"
    status_code = 403
    default_message = "This media is private."


class UnavailableMedia(ProviderError):
    code = "unavailable_media"
    status_code = 404
    default_message = "This media is no longer available."


class RestrictedMedia(ProviderError):
    code = "restricted_media"
    status_code = 403
    default_message = "This media is restricted and cannot be downloaded."


class UnsupportedMedia(ProviderError):
    code = "unsupported_media"
    status_code = 422
    default_message = "This type of media is not supported."


class MediaTooLong(ProviderError):
    code = "media_too_long"
    status_code = 422
    default_message = "This media is longer than the allowed duration."


class ConversionFailed(ProviderError):
    code = "conversion_failed"
    status_code = 500
    default_message = "Audio conversion failed."


class JobCancelled(ProviderError):
    code = "cancelled"
    status_code = 409
    default_message = "The download was cancelled."


ProgressCallback = Callable[["JobStage", float], None]


class MediaProvider(ABC):
    name: ClassVar[str]

    @abstractmethod
    def validate_url(self, url: str) -> str | None:
        """Return the canonical URL, or ``None`` if this provider does not handle ``url``.

        Must be pure: no network access.
        """

    @abstractmethod
    async def get_metadata(self, canonical_url: str) -> MediaMetadata: ...

    @abstractmethod
    async def extract_audio(
        self,
        canonical_url: str,
        dest_dir: Path,
        file_stem: str,
        on_progress: ProgressCallback,
        cancel_event: threading.Event,
    ) -> Path:
        """Produce ``dest_dir/<file_stem>.mp3`` and return its path."""
