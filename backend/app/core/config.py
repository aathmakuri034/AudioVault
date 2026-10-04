"""Application settings, loaded from environment variables and an optional ``.env`` file."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Auth
    api_key: str = Field(default="", validate_default=True)

    # Providers
    enabled_providers: Annotated[list[str], NoDecode] = ["youtube"]

    # Storage
    temp_dir: Path = Path("./tmp")

    # Limits
    max_duration_seconds: int = 1800
    max_concurrent_jobs: int = Field(default=2, ge=1)
    max_queued_jobs: int = Field(default=20, ge=1)
    job_ttl_seconds: float = 1800
    job_timeout_seconds: float = 600
    max_request_bytes: int = 4096
    socket_timeout_seconds: int = 20
    max_filesize_bytes: int = 500 * 1024 * 1024

    # Conversion
    mp3_bitrate_kbps: int = 192
    ytdlp_js_runtime: str = "deno"
    ffmpeg_location: str | None = None

    # Rate limits (slowapi syntax)
    metadata_rate_limit: str = "30/minute"
    download_rate_limit: str = "10/minute"

    # Logging
    log_level: str = "INFO"

    @field_validator("api_key")
    @classmethod
    def _api_key_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError(
                "API_KEY must be set to a non-empty secret (try: openssl rand -hex 32)"
            )
        return value

    @field_validator("enabled_providers", mode="before")
    @classmethod
    def _split_providers(cls, value: object) -> object:
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                return [str(v).strip().lower() for v in json.loads(text)]
            return [p.strip().lower() for p in text.split(",") if p.strip()]
        return value

    @field_validator("temp_dir")
    @classmethod
    def _resolve_temp_dir(cls, value: Path) -> Path:
        return value.expanduser().resolve()

    @field_validator("ffmpeg_location", mode="before")
    @classmethod
    def _blank_to_none(cls, value: object) -> object:
        return value or None


@lru_cache
def get_settings() -> Settings:
    return Settings()
