import pytest

from app.core.config import Settings
from app.core.errors import InvalidUrl, UnsupportedUrl
from app.providers.registry import ProviderRegistry
from app.providers.youtube import YouTubeProvider


def _settings(**kw) -> Settings:
    return Settings(_env_file=None, api_key="k", **kw)


def test_resolve_youtube():
    reg = ProviderRegistry.from_settings(_settings())
    provider, canonical = reg.resolve("https://youtu.be/aqz-KE-bpKQ?t=1")
    assert isinstance(provider, YouTubeProvider)
    assert canonical == "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
    assert reg.names == ["youtube"]


def test_unsupported_and_invalid():
    reg = ProviderRegistry.from_settings(_settings())
    with pytest.raises(UnsupportedUrl):
        reg.resolve("https://example.com/video")
    with pytest.raises(InvalidUrl):
        reg.resolve("javascript:alert(1)")
    with pytest.raises(InvalidUrl):
        reg.resolve("https://user:pw@youtu.be/aqz-KE-bpKQ")


def test_provider_can_be_disabled():
    reg = ProviderRegistry.from_settings(_settings(enabled_providers=[]))
    assert reg.names == []
    with pytest.raises(UnsupportedUrl):
        reg.resolve("https://youtu.be/aqz-KE-bpKQ")


def test_unknown_provider_fails_startup():
    with pytest.raises(ValueError, match="Unknown ENABLED_PROVIDERS"):
        ProviderRegistry.from_settings(_settings(enabled_providers=["nope"]))
