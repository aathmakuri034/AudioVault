"""YouTube provider backed by yt-dlp + FFmpeg.

User input is never handed to yt-dlp raw: URLs are validated and rebuilt as
``https://www.youtube.com/watch?v=<id>``. yt-dlp runs FFmpeg with argument lists
(no shell), and output files are named after the job UUID, never the title.
"""

import asyncio
import glob
import logging
import re
import threading
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError

from app.core.config import Settings
from app.core.errors import AppError
from app.models.job import JobStage
from app.providers.base import (
    ConversionFailed,
    JobCancelled,
    MediaMetadata,
    MediaProvider,
    MediaTooLong,
    PrivateMedia,
    ProgressCallback,
    ProviderError,
    RestrictedMedia,
    UnavailableMedia,
    UnsupportedMedia,
)
from app.utils.url import UrlRejected, parse_http_url

logger = logging.getLogger(__name__)

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}
_SHORT_HOST = "youtu.be"
_ID_PATH_PREFIXES = {"shorts", "embed", "live"}

_DOWNLOAD_SHARE = 0.85  # download occupies progress 0 -> 0.85
_CONVERT_START = 0.9


def canonicalize(url: str) -> str | None:
    """Return ``https://www.youtube.com/watch?v=ID`` for a supported URL, else ``None``."""
    try:
        parts = parse_http_url(url)
    except UrlRejected:
        return None
    host = parts.hostname or ""
    segments = [s for s in parts.path.split("/") if s]
    video_id: str | None = None
    if host == _SHORT_HOST:
        if len(segments) == 1:
            video_id = segments[0]
    elif host in _YOUTUBE_HOSTS:
        if segments == ["watch"]:
            values = parse_qs(parts.query).get("v", [])
            video_id = values[0] if values else None
        elif len(segments) == 2 and segments[0] in _ID_PATH_PREFIXES:
            video_id = segments[1]
    if video_id and _ID_RE.match(video_id):
        return f"https://www.youtube.com/watch?v={video_id}"
    return None


def _best_thumbnail(info: dict[str, Any]) -> str | None:
    direct = info.get("thumbnail")
    if isinstance(direct, str) and direct.startswith("https://"):
        return direct
    candidates = [
        t
        for t in info.get("thumbnails") or []
        if isinstance(t, dict) and str(t.get("url", "")).startswith("https://")
    ]
    if not candidates:
        return None
    best = max(
        candidates,
        key=lambda t: (t.get("preference") or 0, t.get("height") or 0, t.get("width") or 0),
    )
    return str(best["url"])


def parse_info(info: dict[str, Any]) -> MediaMetadata:
    """Convert a yt-dlp info dict into ``MediaMetadata``. Pure."""
    if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
        raise UnsupportedMedia("Live streams are not supported.")
    video_id = str(info.get("id") or "")
    if not _ID_RE.match(video_id):
        raise ProviderError()
    duration = info.get("duration")
    return MediaMetadata(
        provider="youtube",
        source_id=video_id,
        source_url=f"https://www.youtube.com/watch?v={video_id}",
        title=str(info.get("title") or "Untitled"),
        creator=str(info.get("uploader") or info.get("channel") or "Unknown creator"),
        thumbnail_url=_best_thumbnail(info),
        duration_seconds=int(duration) if duration is not None else None,
    )


_ERROR_RULES: tuple[tuple[tuple[str, ...], type[AppError]], ...] = (
    (("private video",), PrivateMedia),
    # Checked before "unavailable": "not available in your country" is a restriction.
    (
        (
            "sign in to confirm your age",
            "age-restricted",
            "not available in your country",
            "members-only",
        ),
        RestrictedMedia,
    ),
    (
        (
            "video unavailable",
            "has been removed",
            "not available",
            "does not exist",
            "account associated with this video has been terminated",
        ),
        UnavailableMedia,
    ),
    (("ffmpeg", "postprocessing"), ConversionFailed),
)


def map_ytdlp_error(exc: BaseException) -> AppError:
    """Map a yt-dlp exception to a client-safe ``AppError`` by message substring."""
    text = str(exc).lower()
    for needles, error_cls in _ERROR_RULES:
        if any(n in text for n in needles):
            return error_cls()
    return ProviderError()


def build_download_opts(
    settings: Settings,
    dest_dir: Path,
    file_stem: str,
    on_progress: ProgressCallback,
    cancel_event: threading.Event,
    state: dict[str, bool] | None = None,
) -> dict[str, Any]:
    """Build the yt-dlp options for an audio extraction. Pure apart from the closures."""
    state = state if state is not None else {}

    def check_cancel() -> None:
        if cancel_event.is_set():
            raise JobCancelled()

    def progress_hook(d: dict[str, Any]) -> None:
        check_cancel()
        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if total:
                fraction = min((d.get("downloaded_bytes") or 0) / total, 1.0)
                on_progress(JobStage.DOWNLOADING, fraction * _DOWNLOAD_SHARE)
        elif status == "finished":
            on_progress(JobStage.DOWNLOADING, _DOWNLOAD_SHARE)

    def postprocessor_hook(d: dict[str, Any]) -> None:
        check_cancel()
        if d.get("status") == "started":
            on_progress(JobStage.CONVERTING, _CONVERT_START)

    def match_filter(info: dict[str, Any], *, incomplete: bool = False) -> str | None:
        duration = info.get("duration")
        if duration is not None and duration > settings.max_duration_seconds:
            state["too_long"] = True
            return "media is too long"
        return None

    opts: dict[str, Any] = {
        "format": "bestaudio/best",
        "noplaylist": True,
        "outtmpl": str(dest_dir / f"{file_stem}.%(ext)s"),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": str(settings.mp3_bitrate_kbps),
            }
        ],
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "socket_timeout": settings.socket_timeout_seconds,
        "js_runtimes": {settings.ytdlp_js_runtime: {}},
        "match_filter": match_filter,
        "max_filesize": settings.max_filesize_bytes,
        "restrictfilenames": True,
        "cachedir": False,
        "writethumbnail": False,
        "ignoreconfig": True,
        "progress_hooks": [progress_hook],
        "postprocessor_hooks": [postprocessor_hook],
    }
    if settings.ffmpeg_location:
        opts["ffmpeg_location"] = settings.ffmpeg_location
    return opts


def _cleanup_partials(dest_dir: Path, file_stem: str) -> None:
    for name in glob.glob(f"{glob.escape(file_stem)}.*", root_dir=dest_dir):
        try:
            (dest_dir / name).unlink(missing_ok=True)
        except OSError:
            logger.warning("could not remove partial file")


class YouTubeProvider(MediaProvider):
    name = "youtube"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def validate_url(self, url: str) -> str | None:
        return canonicalize(url)

    async def get_metadata(self, canonical_url: str) -> MediaMetadata:
        info = await asyncio.to_thread(self._fetch_info, canonical_url)
        metadata = parse_info(info)
        limit = self._settings.max_duration_seconds
        if metadata.duration_seconds is not None and metadata.duration_seconds > limit:
            raise MediaTooLong(f"This media is longer than {limit // 60} minutes.")
        return metadata

    def _fetch_info(self, canonical_url: str) -> dict[str, Any]:
        opts: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "skip_download": True,
            "socket_timeout": self._settings.socket_timeout_seconds,
            "js_runtimes": {self._settings.ytdlp_js_runtime: {}},
            "cachedir": False,
            "ignoreconfig": True,
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(canonical_url, download=False)
        except (DownloadError, ExtractorError) as exc:
            logger.warning("yt-dlp metadata failure: %s", exc)
            raise map_ytdlp_error(exc) from exc
        except Exception as exc:
            logger.exception("unexpected metadata failure")
            raise ProviderError() from exc
        if not isinstance(info, dict) or info.get("_type") in ("playlist", "multi_video"):
            raise UnsupportedMedia()
        return info

    async def extract_audio(
        self,
        canonical_url: str,
        dest_dir: Path,
        file_stem: str,
        on_progress: ProgressCallback,
        cancel_event: threading.Event,
    ) -> Path:
        return await asyncio.to_thread(
            self._extract_audio_sync, canonical_url, dest_dir, file_stem, on_progress, cancel_event
        )

    def _extract_audio_sync(
        self,
        canonical_url: str,
        dest_dir: Path,
        file_stem: str,
        on_progress: ProgressCallback,
        cancel_event: threading.Event,
    ) -> Path:
        dest_dir.mkdir(parents=True, exist_ok=True)
        state: dict[str, bool] = {}
        opts = build_download_opts(
            self._settings, dest_dir, file_stem, on_progress, cancel_event, state
        )
        try:
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    ydl.download([canonical_url])
            except JobCancelled:
                raise
            except (DownloadError, ExtractorError) as exc:
                if cancel_event.is_set():
                    raise JobCancelled() from exc
                logger.warning("yt-dlp download failure: %s", exc)
                raise map_ytdlp_error(exc) from exc
            if cancel_event.is_set():
                raise JobCancelled()
            if state.get("too_long"):
                raise MediaTooLong()
            output = dest_dir / f"{file_stem}.mp3"
            if not output.is_file() or output.stat().st_size == 0:
                raise ConversionFailed()
            return output
        except AppError:
            _cleanup_partials(dest_dir, file_stem)
            raise
        except Exception as exc:
            _cleanup_partials(dest_dir, file_stem)
            if cancel_event.is_set():
                raise JobCancelled() from exc
            logger.exception("unexpected extraction failure")
            raise ProviderError() from exc
