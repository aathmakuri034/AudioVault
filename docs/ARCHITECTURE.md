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
| Auth | `X-API-Key` header + per-job random file token | Keeps LAN strangers out; file URLs are unguessable and expire with the job. |
| Playback | expo-audio behind an `AudioEngine` interface, driven by an app-level `AudioService` | RNTP v4 is broken on the mandatory New Architecture; RNTP v5 is commercially licensed. expo-audio is first-party/MIT and provides background audio, Now Playing and the Android foreground service. |
| Lock-screen next/previous | Local Swift module (`modules/audiovault-remote-commands`) | expo-audio registers play/pause/seek but not track navigation. |
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

## Phase: Search

### Search

- The Search tab (`frontend/src/app/(tabs)/search.tsx`) re-exports `features/search/screens/SearchScreen.tsx`, a single `SectionList` with "Songs" (`SongRow`) and "Playlists" (`PlaylistRow`) sections.
- `features/search/searchLibrary.ts` trims the query, returns empty results for a blank query without touching the DB, and runs `songs.search` (limit 50) and `playlists.search` (limit 20) in parallel.
- `features/search/useLibrarySearch.ts` debounces input by 200 ms, discards stale responses, and re-runs when the library store's songs or playlists change, so a song deleted from a result's menu disappears immediately.
- **Offline-only by design:** it queries only the local SQLite library (title, creator, playlist name). No network or YouTube search is ever called, so it works in airplane mode.
- Repository `LIKE` queries escape `%` and `_`, so those characters match literally.

## Phase 1: Project architecture (frontend)

- `app.json`: AudioVault identity, dark UI. Through the expo-audio plugin it enables `UIBackgroundModes: audio` and the Android `mediaPlayback` foreground service, with **no** microphone permissions. It also adds a local-network ATS exception for the dev backend.
- `src/theme`: design tokens (palette from the spec: `#0F0F0F` / `#181818` / `#212121` / `#FF0000`).
- `src/types/models.ts`: app-facing domain types. The DB layer maps snake_case rows into them.
- **Route files are one-line re-exports.** Screens live in `src/features/*/screens`, so navigation (`src/app`) stays separate from UI and logic.

## Phase 2: SQLite schema

- `services/database/migrations.ts`: versioned through `PRAGMA user_version`; refuses to open a newer schema. Tables: `songs`, `playlists`, `playlist_songs`, `playback_history`, `downloads` (in-flight imports, for resume) and `app_settings`.
- **Foreign keys.** `playlist_songs` and `playback_history` use `ON DELETE CASCADE`, so deleting a song removes its playlist references and history automatically. `downloads.song_id` uses `SET NULL`. `PRAGMA foreign_keys = ON` is applied on every connection (SQLite defaults to off).
- **Uniqueness.** `UNIQUE(provider, source_id)` on `songs` is the duplicate-download guard, and the primary key on `playlist_songs(playlist_id, song_id)` stops a song being added to a playlist twice.
- **Indexes** support recent / title / creator sorting, favorites, recently played and playlist ordering.
- **Testable repositories.** They depend on a 5-method `SqlDatabase` interface, not expo-sqlite. Tests run the real schema in better-sqlite3 (`test-utils/sqliteTestDb.ts`). Foreign keys start off there, so tests prove the pragma is applied.

## Phase 3: Navigation

- **Root native stack** (`app/_layout.tsx`) with bottom tabs (`(tabs)`: Home, Search, Library). Now Playing is a full-screen modal that slides up. Queue, Song Details and Confirm Download are modals; Create/Edit Playlist is a form sheet.
- **Bootstrap gate.** The splash screen stays up until `services/bootstrap.ts` has opened and migrated the DB, pruned orphan files, loaded the library, restored the queue and resumed downloads. A failed start shows a retry screen instead of crashing.

## Phase 4: Mock library and storage

- `services/filesystem/musicStorage.ts`: files live at `Documents/music/{uuid}.mp3|.jpg`. Ids must be UUIDs, so titles never become paths. `resolvePlayableUri` refuses anything that isn't a local file inside the music directory, so playback can never fall back to a remote URL.
- `features/library/libraryService.ts`: delete removes the **DB row first** (cascading playlist references and history), then the files. A crash between the two leaves only orphan files, which `cleanUpOrphans()` prunes at the next launch. The reverse order could leave a row pointing at a missing file.
- `scripts/generate-sample-audio.sh`: four 30-second synthetic tones made with FFmpeg, loaded by the dev-only "Load sample library" action.

## Phases 5–6: Audio, background playback and native controls

```
index.ts ── registerPlaybackService() ── AudioService.attach()   (outside React)
                                             │
            QueueManager (pure) ◀────────────┤────────▶ AudioEngine (interface)
                                             │              └─ ExpoAudioEngine (expo-audio + remote-commands module)
            playerStore (zustand, read-only) ◀┘
```

- **`queueManager.ts`.** The play order is an index list over the original songs, so turning shuffle off restores the original order. Repeat has separate rules for *track ended* (repeat-one replays) and *user pressed Next* (always advances). It supports snapshot and restore.
- **`player.ts` (AudioService).** The only owner of playback. It handles track-end auto-advance, remote next/previous, play-history recording (once per load, not per status tick), missing-file skipping, and debounced persistence of the queue and position. On launch it restores **paused**. On return to the foreground, `syncFromEngine()` re-reads the engine and never reloads, so Now Playing reflects the live state.
- **`expoAudioEngine.ts`.**
  - A single long-lived `AudioPlayer` is reused through `replace()`, so it stays the Now Playing owner.
  - `setAudioModeAsync` sets `shouldPlayInBackground`, `playsInSilentMode` and `interruptionMode: 'doNotMix'` (required for lock-screen controls), and `keepAudioSessionActive` keeps the controls visible while paused.
  - Lock-screen ±10 s buttons are hidden so iOS shows next/previous.
- **`modules/audiovault-remote-commands`.** A roughly 60-line Swift Expo module that owns only `nextTrackCommand` and `previousTrackCommand` on `MPRemoteCommandCenter`, and emits events to JS. JS loads it with `requireOptionalNativeModule`, so it's simply absent on Android, in Jest and in Expo Go.
- **Android.** expo-audio's foreground service provides background playback, the media notification, play/pause and seek. Its `AudioMediaSessionCallback` explicitly removes `COMMAND_SEEK_TO_NEXT/PREVIOUS`, and the session player wraps a single item. Enabling next/previous needs a patch to that callback, plus forwarding `seekToNext`/`seekToPrevious` to JS. That patch is deferred until an Android toolchain is available to verify it.
- **Tests** (`__tests__/player.test.ts`) drive a `FakeAudioEngine` that emits status and remote commands with no React tree mounted. That's the same path native events take while the app is backgrounded.

## Phase 7: Playlists

- `features/playlists/playlistActions.ts`: thin use cases over the repository, followed by a library refresh. Everything is offline in SQLite.
- **Details screen:** Play, Shuffle, rename, delete, and an edit mode to reorder (up/down) or remove songs.
- **Song menu.** `components/songs/SongActionsSheet.tsx` is the one menu every list uses: play next, add to queue, add to playlist (inline picker), remove from playlist, favorite, details, delete. Follow-up navigation and alerts run **after** the sheet's iOS `onDismiss`, because presenting during a modal dismissal can be silently dropped.

## Phase 10: Download manager

```
Home URL ─ validateMediaUrl (zod, provider-agnostic)
        ─ api.getMetadata ─ duplicate check (songs + in-flight downloads)
        ─ Confirm screen (consent) ─ storage check ─ downloads row (preparing)
        ─ api.startDownload ─ poll getJob ─▶ downloading ─▶ processing
        ─ saving: background URLSession transfer → music/{id}.mp3, size == server fileSize
        ─ artwork (optional) ─ songs row ─ completed ─ DELETE job (server deletes temp file)
```

- **`downloadMachine.ts`.** The spec's states (`validating → preparing → downloading → processing → saving → completed | failed`) with enforced transitions and monotonic progress bands.
- **`downloadManager.ts`.**
  - **Persistence.** Every import is a `downloads` row, and `resumeActive()` continues them at launch and on each return to the foreground. The download id *is* the song id, so a resumed transfer writes to the same file.
  - **Polling** tolerates brief network drops.
  - **Corruption check.** A size mismatch, which also catches an HTTP error body saved as a file, fails with `corrupted_file`.
  - **Cancel** aborts the transfer and deletes partial files and the server job.
  - **Retry** reuses the server job for transient failures and starts a new job otherwise.
  - It never throws out of `run()`; every failure ends in a `failed` row with a friendly message.
- **`fileTransfer.ts`.** `File.createDownloadTask(..., { sessionType: 'background' })`: the MP3 transfer continues while the app is suspended or the screen is locked.
- **`services/api`.** zod-validated responses, `X-API-Key`, timeouts, and normalized `ApiError` codes. The server address is a setting; the API key lives in the Keychain via expo-secure-store.
- **Consent.** A modal appears before the first download, and its acceptance is saved in `app_settings`. Every confirm screen also has the acknowledgement checkbox, pre-checked once accepted.

## Phase 11: Polish and release readiness

- Home shelves (Recently Played, Recently Downloaded, Favorites, Playlists), Settings (server, key test, storage, consent reset), CI (`.github/workflows/ci.yml`) and a manual device QA plan (`docs/QA_CHECKLIST.md`).
- **Follow-ups before a commercial release:**
  - per-user auth and HTTPS
  - exclude `Documents/music` from iCloud backup
  - Android next/previous patch
  - durable job queue (Redis)
  - legal review of provider terms (the YouTube provider can be disabled with `ENABLED_PROVIDERS`)
