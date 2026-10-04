# AudioVault Architecture

AudioVault is an offline-first music library and player. A user imports audio
they own or have permission to download, the backend converts it to MP3, and
the mobile app stores it in private app storage for fully offline playback.

```
frontend/   Expo (React Native + TypeScript) mobile app
backend/    FastAPI media-processing service (Docker)
docs/       Architecture notes and QA checklists
```

## End-to-end pipeline

```
URL ─▶ Mobile app ─▶ POST /api/media/metadata ─▶ MediaProvider.validate_url / get_metadata
                    ─▶ POST /api/media/download ─▶ job queue ─▶ MediaProvider.extract_audio (yt-dlp + FFmpeg)
                    ─▶ GET /api/media/jobs/{id}      (poll status/progress)
                    ─▶ GET /api/media/jobs/{id}/file (one-time token, deleted after download)
                    ─▶ private app storage /music/{songId}.mp3
                    ─▶ SQLite metadata ─▶ Track Player ─▶ iOS/Android native media controls
```

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Repo layout | `frontend/` + `backend/` | Independent toolchains, independent deploys. |
| Provider abstraction | `MediaProvider` ABC + registry | YouTube is one plug-in; can be disabled via `ENABLED_PROVIDERS` without touching the app. |
| Job execution | In-process asyncio queue + in-memory store | Single-user MVP; no Redis/Celery container on an Intel laptop. |
| Auth | `X-API-Key` header + per-job one-time file token | Keeps LAN strangers out; file URLs are unguessable and single-use. |
| Playback | react-native-track-player as an app-level service | Native Now Playing, lock screen, remote events, Android foreground service. |
| Mini-player | None (per spec) | A header "now playing" pill navigates to the Now Playing screen. |
| Persistence | expo-sqlite with migrations | Library, playlists, history, and pending downloads all work offline. |
| Storage | `Paths.document/music/{uuid}.mp3` | Private sandbox; never exposed to Files/Downloads/Music. UUID names, never titles. |

Phase-by-phase notes are appended below as the app is built.

## Phase: Backend

FastAPI service in `backend/` that turns a user-supplied URL (for media the user owns or is authorized to download) into a temporary MP3 the app fetches once and then acknowledges.

### Layout

| Path | Responsibility |
|---|---|
| `app/main.py` | `create_app()` factory. Lifespan validates settings, purges `TEMP_DIR`, starts the job runner and a 60 s cleanup loop. |
| `app/core/config.py` | `Settings` (pydantic-settings). Startup fails with a clear message if `API_KEY` is empty. |
| `app/core/errors.py` | `AppError` hierarchy and handlers; the single error contract. |
| `app/core/security.py` | `X-API-Key` dependency and token generation, both using constant-time comparison. |
| `app/core/rate_limit.py` | slowapi limiter; limit strings are read from settings per request. |
| `app/core/middleware.py` | Request id + JSON access log (path only, no query string) and request-body size limit. |
| `app/core/logging.py` | Stdlib JSON logging. |
| `app/providers/` | `MediaProvider` ABC, `YouTubeProvider` (yt-dlp + FFmpeg), `ProviderRegistry`. |
| `app/services/media/` | `JobStore` (in-memory, TTL), `JobRunner` (bounded queue + workers), `MediaService` (orchestration). |
| `app/api/` | Thin routes (`/health`, `/api/media/*`) and dependencies. |
| `app/schemas/`, `app/models/` | camelCase wire models; `Job` dataclass and enums. |
| `app/utils/` | Generic URL sanitation; confined temp-file helpers. |

### Decisions

- **Provider abstraction.** A provider validates a URL purely (no network) and returns a canonical URL, fetches metadata, and extracts audio. `ENABLED_PROVIDERS` selects providers at startup, so one can be switched off without code changes. The YouTube provider only accepts known hosts and an 11-character video id, and rebuilds `https://www.youtube.com/watch?v=ID`; raw user input never reaches yt-dlp. Blocking yt-dlp calls run in `asyncio.to_thread`; the JS runtime is `YTDLP_JS_RUNTIME` (`deno` in Docker, `node` locally).
- **Auth.** Every `/api/media` route needs `X-API-Key`. The file route additionally needs the per-job `token` (from the download response). `/health` is public.
- **Job lifecycle.**

  ```
  queued ──worker picks up──▶ processing(downloading → converting) ──▶ complete (stage ready)
    │                              │
    │                              ├─▶ failed (provider error, timeout, conversion_failed)
    └── DELETE / cancel ───────────┴─▶ failed (stage cancelled)
  complete/failed ──TTL──▶ removed (files deleted)
  ```

  API status is one of `queued|processing|complete|failed`; `stage` adds `downloading|converting|ready|failed|cancelled`. The queue is bounded (`MAX_QUEUED_JOBS`, else `503 server_busy`); `MAX_CONCURRENT_JOBS` workers run jobs, each under `JOB_TIMEOUT_SECONDS`. A second submit for the same provider + source id returns the existing active or unexpired completed job.
- **Temp file lifecycle.** Each job writes to `TEMP_DIR/<job-uuid>/<job-uuid>.mp3` (never the title). Files are not deleted on send; the app calls `DELETE /api/media/jobs/{id}` after storing the file, which also cancels a running job (idempotent, 204). Anything else is removed by TTL expiry, failure cleanup, or the startup purge. Every path is resolved and checked to be inside `TEMP_DIR` before serving or deleting.
- **Rate limits.** Per client IP: `METADATA_RATE_LIMIT` and `DOWNLOAD_RATE_LIMIT`; `429` with `Retry-After`. Request bodies over `MAX_REQUEST_BYTES` get `413`, whether declared or chunked.
- **Error contract.** Every error is `{"error": {"code", "message"}}` with a snake_case code (`invalid_url`, `private_media`, `unavailable_media`, `restricted_media`, `unsupported_media`, `media_too_long`, `provider_error`, `conversion_failed`, `job_not_found`, `job_not_ready`, `file_expired`, `invalid_token`, `unauthorized`, `payload_too_large`, `rate_limited`, `server_busy`, `timeout`, `invalid_request`, `internal_error`, ...). yt-dlp messages are mapped by substring to these codes; raw output and stack traces are only logged server-side.
- **State is in-process.** Jobs live in memory, so run a single worker process (the Docker CMD does). A restart drops all jobs and purges temp files.
