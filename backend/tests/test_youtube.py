import threading

import pytest

from app.core.config import Settings
from app.models.job import JobStage
from app.providers import youtube
from app.providers.base import (
    ConversionFailed,
    JobCancelled,
    MediaTooLong,
    PrivateMedia,
    ProviderError,
    RestrictedMedia,
    UnavailableMedia,
    UnsupportedMedia,
)
from app.providers.youtube import (
    YouTubeProvider,
    build_download_opts,
    map_ytdlp_error,
    parse_info,
)

VID = "aqz-KE-bpKQ"
CANON = f"https://www.youtube.com/watch?v={VID}"


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(_env_file=None, api_key="k", temp_dir=tmp_path)


@pytest.fixture
def provider(settings) -> YouTubeProvider:
    return YouTubeProvider(settings)


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={VID}",
        f"http://youtube.com/watch?v={VID}",
        f"https://m.youtube.com/watch?v={VID}&t=42s",
        f"https://music.youtube.com/watch?v={VID}&list=RDAMVM{VID}",
        f"https://www.youtube.com/watch?list=PL123&v={VID}",
        f"https://youtu.be/{VID}",
        f"https://youtu.be/{VID}?si=abc&t=3",
        f"https://www.youtube.com/shorts/{VID}",
        f"https://www.youtube.com/embed/{VID}",
        f"https://www.youtube.com/live/{VID}?feature=share",
        f"https://WWW.YouTube.com/watch?v={VID}",
        f"https://www.youtube.com:443/watch?v={VID}",
    ],
)
def test_validate_url_valid(provider, url):
    assert provider.validate_url(url) == CANON


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.com/watch?v=" + VID,
        "https://youtube.com.evil.com/watch?v=" + VID,
        "https://notyoutube.com/watch?v=" + VID,
        "javascript:alert(1)",
        f"ftp://www.youtube.com/watch?v={VID}",
        f"https://user:pass@www.youtube.com/watch?v={VID}",
        f"https://www.youtube.com:8080/watch?v={VID}",
        "https://www.youtube.com/watch?v=short",
        "https://www.youtube.com/watch?v=" + VID + "x",
        "https://www.youtube.com/watch?v=bad!bad!bad",
        "https://www.youtube.com/watch",
        "https://www.youtube.com/playlist?list=PL123",
        "https://www.youtube.com/shorts/" + VID + "/extra",
        "https://youtu.be/",
        f"https://youtu.be/{VID}/more",
        f"https://www.youtube.com/watch?v={VID} ",
        f"https://www.youtube.com/watch?v={VID}\n",
        f"https://www.youtube.com/watch?v={VID}&x=" + "a" * 2100,
        "",
        "not a url",
    ],
)
def test_validate_url_invalid(provider, url):
    assert provider.validate_url(url) is None


def _info(**over):
    base = {
        "id": VID,
        "title": "Big Buck Bunny",
        "uploader": "Blender",
        "thumbnail": "https://i.ytimg.com/vi/x/maxres.jpg",
        "duration": 596.4,
    }
    return {**base, **over}


def test_parse_info_basic():
    meta = parse_info(_info())
    assert meta.provider == "youtube"
    assert meta.source_id == VID
    assert meta.source_url == CANON
    assert meta.title == "Big Buck Bunny"
    assert meta.creator == "Blender"
    assert meta.duration_seconds == 596


def test_parse_info_fallbacks():
    meta = parse_info(
        _info(
            uploader=None,
            channel="Chan",
            thumbnail=None,
            thumbnails=[
                {"url": "https://a/small.jpg", "height": 90},
                {"url": "https://a/big.jpg", "height": 720},
                {"url": "http://insecure/x.jpg", "height": 2000},
            ],
            duration=None,
        )
    )
    assert meta.creator == "Chan"
    assert meta.thumbnail_url == "https://a/big.jpg"
    assert meta.duration_seconds is None
    assert parse_info(_info(uploader=None, channel=None)).creator == "Unknown creator"


@pytest.mark.parametrize(
    "extra",
    [{"is_live": True}, {"live_status": "is_live"}, {"live_status": "is_upcoming"}],
)
def test_parse_info_rejects_live(extra):
    with pytest.raises(UnsupportedMedia):
        parse_info(_info(**extra))


def test_parse_info_rejects_bad_id():
    with pytest.raises(ProviderError):
        parse_info(_info(id="x"))


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("ERROR: [youtube] x: Private video. Sign in", PrivateMedia),
        ("Video unavailable", UnavailableMedia),
        ("This video has been removed by the uploader", UnavailableMedia),
        ("The video does not exist", UnavailableMedia),
        ("The account associated with this video has been terminated", UnavailableMedia),
        ("This video is not available", UnavailableMedia),
        ("Sign in to confirm your age", RestrictedMedia),
        ("This video may be inappropriate: age-restricted", RestrictedMedia),
        ("Video not available in your country", RestrictedMedia),
        ("Join this channel: members-only content", RestrictedMedia),
        ("ffprobe and ffmpeg not found", ConversionFailed),
        ("Postprocessing: error", ConversionFailed),
        ("HTTP Error 500", ProviderError),
    ],
)
def test_map_ytdlp_error(message, expected):
    err = map_ytdlp_error(Exception(message))
    assert type(err) is expected


def test_map_ytdlp_error_codes():
    assert map_ytdlp_error(Exception("PRIVATE VIDEO")).code == "private_media"
    assert map_ytdlp_error(Exception("boom")).status_code == 502
    assert (
        map_ytdlp_error(Exception("boom")).message
        == "The media provider could not complete the request."
    )


def test_download_opts(settings, tmp_path):
    events: list[tuple[JobStage, float]] = []
    cancel = threading.Event()
    opts = build_download_opts(
        settings, tmp_path, "stem", lambda s, f: events.append((s, f)), cancel
    )
    assert opts["format"] == "bestaudio/best"
    assert opts["noplaylist"] is True
    assert opts["outtmpl"] == str(tmp_path / "stem.%(ext)s")
    assert opts["restrictfilenames"] is True
    assert opts["cachedir"] is False
    assert opts["writethumbnail"] is False
    assert opts["js_runtimes"] == {"deno": {}}
    assert opts["postprocessors"][0]["preferredcodec"] == "mp3"
    assert opts["postprocessors"][0]["preferredquality"] == "192"
    assert "ffmpeg_location" not in opts

    opts["progress_hooks"][0]({"status": "downloading", "downloaded_bytes": 50, "total_bytes": 100})
    opts["progress_hooks"][0](
        {"status": "downloading", "downloaded_bytes": 5, "total_bytes_estimate": 10}
    )
    opts["progress_hooks"][0]({"status": "finished"})
    opts["postprocessor_hooks"][0]({"status": "started", "postprocessor": "ExtractAudio"})
    assert events == [
        (JobStage.DOWNLOADING, pytest.approx(0.425)),
        (JobStage.DOWNLOADING, pytest.approx(0.425)),
        (JobStage.DOWNLOADING, 0.85),
        (JobStage.CONVERTING, 0.9),
    ]

    cancel.set()
    with pytest.raises(JobCancelled):
        opts["progress_hooks"][0]({"status": "downloading"})
    with pytest.raises(JobCancelled):
        opts["postprocessor_hooks"][0]({"status": "started"})


def test_download_opts_ffmpeg_and_runtime(tmp_path):
    s = Settings(
        _env_file=None,
        api_key="k",
        ytdlp_js_runtime="node",
        ffmpeg_location="/opt/ffmpeg",
        max_duration_seconds=60,
    )
    state: dict[str, bool] = {}
    opts = build_download_opts(s, tmp_path, "s", lambda *_: None, threading.Event(), state)
    assert opts["js_runtimes"] == {"node": {}}
    assert opts["ffmpeg_location"] == "/opt/ffmpeg"
    assert opts["match_filter"]({"duration": 60}) is None
    assert opts["match_filter"]({"duration": None}) is None
    assert opts["match_filter"]({"duration": 61}) is not None
    assert state == {"too_long": True}


class _FakeYDL:
    """Stands in for yt_dlp.YoutubeDL; writes files like a real run would."""

    behaviour = "ok"

    def __init__(self, opts):
        self.opts = opts

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def download(self, urls):
        stem = self.opts["outtmpl"].replace(".%(ext)s", "")
        from pathlib import Path

        Path(stem + ".webm").write_bytes(b"partial")
        if self.behaviour == "ok":
            Path(stem + ".mp3").write_bytes(b"mp3data")
        elif self.behaviour == "error":
            raise youtube.DownloadError("ERROR: Private video")


@pytest.mark.parametrize(
    ("behaviour", "exc"),
    [("error", PrivateMedia), ("nofile", ConversionFailed)],
)
async def test_extract_audio_failure_cleans_partials(
    provider, tmp_path, monkeypatch, behaviour, exc
):
    monkeypatch.setattr(youtube.yt_dlp, "YoutubeDL", _FakeYDL)
    monkeypatch.setattr(_FakeYDL, "behaviour", behaviour)
    with pytest.raises(exc):
        await provider.extract_audio(CANON, tmp_path, "stem", lambda *_: None, threading.Event())
    assert list(tmp_path.glob("stem.*")) == []


async def test_extract_audio_success(provider, tmp_path, monkeypatch):
    monkeypatch.setattr(youtube.yt_dlp, "YoutubeDL", _FakeYDL)
    monkeypatch.setattr(_FakeYDL, "behaviour", "ok")
    out = await provider.extract_audio(CANON, tmp_path, "stem", lambda *_: None, threading.Event())
    assert out == tmp_path / "stem.mp3"
    assert out.stat().st_size > 0


async def test_get_metadata_enforces_duration(provider, monkeypatch):
    monkeypatch.setattr(provider, "_fetch_info", lambda url: _info(duration=99999))
    with pytest.raises(MediaTooLong):
        await provider.get_metadata(CANON)
    monkeypatch.setattr(provider, "_fetch_info", lambda url: _info(duration=100))
    assert (await provider.get_metadata(CANON)).duration_seconds == 100
