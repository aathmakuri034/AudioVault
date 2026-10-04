import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_api_key_required(monkeypatch):
    monkeypatch.delenv("API_KEY", raising=False)
    with pytest.raises(ValidationError, match="API_KEY must be set"):
        Settings(_env_file=None)


def test_blank_api_key_rejected():
    with pytest.raises(ValidationError, match="API_KEY must be set"):
        Settings(_env_file=None, api_key="   ")


def test_defaults_and_provider_parsing(monkeypatch, tmp_path):
    monkeypatch.setenv("API_KEY", "k")
    monkeypatch.setenv("ENABLED_PROVIDERS", "youtube, Other")
    monkeypatch.setenv("TEMP_DIR", str(tmp_path))
    s = Settings(_env_file=None)
    assert s.enabled_providers == ["youtube", "other"]
    assert s.temp_dir == tmp_path.resolve()
    assert s.max_duration_seconds == 1800
    assert s.ytdlp_js_runtime == "deno"
    assert s.ffmpeg_location is None
