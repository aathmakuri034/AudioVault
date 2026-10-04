"""Provider registry: maps a user URL to the provider that can handle it."""

from collections.abc import Callable, Iterable

from app.core.config import Settings
from app.core.errors import InvalidUrl, UnsupportedUrl
from app.providers.base import MediaProvider
from app.providers.youtube import YouTubeProvider
from app.utils.url import UrlRejected, parse_http_url

ProviderFactory = Callable[[Settings], MediaProvider]

PROVIDER_FACTORIES: dict[str, ProviderFactory] = {
    YouTubeProvider.name: YouTubeProvider,
}


class ProviderRegistry:
    def __init__(self, providers: Iterable[MediaProvider]) -> None:
        self._providers = list(providers)

    @classmethod
    def from_settings(cls, settings: Settings) -> "ProviderRegistry":
        unknown = [n for n in settings.enabled_providers if n not in PROVIDER_FACTORIES]
        if unknown:
            known = ", ".join(sorted(PROVIDER_FACTORIES))
            raise ValueError(f"Unknown ENABLED_PROVIDERS entries: {unknown} (known: {known})")
        return cls(PROVIDER_FACTORIES[name](settings) for name in settings.enabled_providers)

    @property
    def names(self) -> list[str]:
        return [p.name for p in self._providers]

    def get(self, name: str) -> MediaProvider:
        for provider in self._providers:
            if provider.name == name:
                return provider
        raise KeyError(name)

    def resolve(self, url: str) -> tuple[MediaProvider, str]:
        try:
            parse_http_url(url)
        except UrlRejected as exc:
            raise InvalidUrl() from exc
        for provider in self._providers:
            canonical = provider.validate_url(url)
            if canonical is not None:
                return provider, canonical
        raise UnsupportedUrl()
