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
