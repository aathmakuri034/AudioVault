# AudioVault

An offline-first music library and player for iOS (Android-ready). Paste a link to media you own or have permission to download. The backend converts it to MP3, and the app stores it in **private app storage** so it plays with no internet, keeps playing in the background, and works with Lock Screen / Control Center controls.

```
frontend/   Expo SDK 57 · React Native 0.86 · TypeScript · Expo Router · Zustand · expo-audio · expo-sqlite
backend/    Python 3.13 · FastAPI · Pydantic · yt-dlp · FFmpeg · Docker
docs/       ARCHITECTURE.md (design + decisions) · QA_CHECKLIST.md (device test plan)
```

> **Content rights.** Only import content you own or are permitted to download. The app asks for this acknowledgement before the first download. The YouTube provider is one plug-in and can be disabled with `ENABLED_PROVIDERS` without an app change. Get a legal review of provider terms before any commercial release.

---

## Contents

- [Prerequisites](#prerequisites)
- [One-time machine setup](#one-time-machine-setup)
- [1. Run the backend](#1-run-the-backend)
- [2. Run the iOS app](#2-run-the-ios-app)
- [3. Connect the app to the backend](#3-connect-the-app-to-the-backend)
- [Day-to-day development](#day-to-day-development)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

---

## Prerequisites

Tested on a 2020 Intel MacBook Pro (macOS 15) targeting iPhone 11 and newer (iOS 16.4+).

| Tool | Version | Used for |
|---|---|---|
| Xcode | 26.x (with iOS Simulator runtime) | Building the iOS app |
| CocoaPods | ≥ 1.16 (Homebrew) | iOS native dependencies |
| Node.js | 22 or 24 LTS recommended (25 works) | Expo / Metro / Jest |
| Docker Desktop | 4.x | Running the backend |
| uv | ≥ 0.12 | Backend tests / running without Docker (optional) |
| FFmpeg | any recent | Only for regenerating sample audio, or running the backend without Docker |

> A **development build** is required. Expo Go can't load the app's native modules, which include the local remote-commands module and background audio.

## One-time machine setup

Complete these once per Mac.

1. **Finish Xcode's first-launch setup.** Xcode will hang or fail to find simulators until this is done.
   ```bash
   sudo xcodebuild -runFirstLaunch
   xcodebuild -downloadPlatform iOS        # iOS Simulator runtime, ~8 GB
   ```
   Then open Xcode once and accept the license if it prompts.

2. **Install a modern CocoaPods.** macOS's system Ruby 2.6 is too old for Expo SDK 57. Homebrew's CocoaPods bundles its own Ruby.
   ```bash
   # Only if an old gem-installed CocoaPods exists (`pod --version` shows < 1.14):
   sudo gem uninstall cocoapods cocoapods-core
   brew install cocoapods
   pod --version                           # should be 1.16+
   ```

3. **Install Docker Desktop** and start it.

## 1. Run the backend

```bash
cd backend
cp .env.example .env
# Generate the shared API key and put it in .env:
sed -i '' "s/^API_KEY=.*/API_KEY=$(openssl rand -hex 32)/" .env
docker compose up --build
```

The API is now on `http://localhost:8000`. Check it:

```bash
curl http://localhost:8000/health
# {"status":"ok","providers":["youtube"]}
```

The image includes FFmpeg and Deno, the JavaScript runtime yt-dlp needs for YouTube. Temporary MP3s live in a RAM-backed tmpfs and are deleted once the app confirms the download, or after `JOB_TTL_SECONDS`. See [`backend/.env.example`](backend/.env.example) for every setting, including limits, rate limits and providers.

<details>
<summary>Run the backend without Docker (optional)</summary>

```bash
cd backend
uv sync
cp .env.example .env   # set API_KEY; set YTDLP_JS_RUNTIME=node if Deno isn't installed
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Requires FFmpeg on your `PATH`.
</details>

## 2. Run the iOS app

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `frontend/.env`:

```bash
EXPO_PUBLIC_API_URL=http://localhost:8000      # Simulator can use localhost
EXPO_PUBLIC_API_KEY=<the API_KEY from backend/.env>
```

Build and launch the development build in the iOS Simulator. The first build takes 10–20 minutes on an Intel Mac:

```bash
npx expo run:ios
```

This generates `frontend/ios/` (gitignored, regenerated from `app.json`), installs pods, builds, installs the app on a Simulator, and starts Metro. Later runs only need Metro unless native code or config changes:

```bash
npm start            # expo start --dev-client; press "i" to open the Simulator
```

### On a physical iPhone

1. Connect the iPhone by cable, unlock it, and trust the Mac.
2. Run `npx expo run:ios --device` and pick your phone.
3. If signing fails, open `frontend/ios/AudioVault.xcworkspace` in Xcode. Under *Signing & Capabilities*, choose your Team. A free personal team works, but builds expire after 7 days.
4. On the phone, enable *Settings → Privacy & Security → Developer Mode*.
5. The phone must reach the backend over Wi-Fi. Use your Mac's LAN IP (see the next section), not `localhost`.

## 3. Connect the app to the backend

`EXPO_PUBLIC_*` values are just development defaults. You can change them in the app under **Library or Home → ⚙ Settings → Media server**:

- **Server address**: the Simulator can use `http://localhost:8000`. A real phone needs your Mac's LAN IP:
  ```bash
  ipconfig getifaddr en0          # e.g. 192.168.1.20  →  http://192.168.1.20:8000
  ```
- **API key**: the `API_KEY` from `backend/.env`. It's stored in the iOS Keychain.
- Tap **Test connection**. It checks both that the server is reachable and that the key is accepted.

iOS asks for **Local Network** permission the first time the app reaches your Mac. Allow it.

## Day-to-day development

| Task | Command |
|---|---|
| Backend up / down | `cd backend && docker compose up --build` / `docker compose down` |
| Backend logs | `docker compose logs -f api` (JSON lines; tokens and keys are never logged) |
| App dev server | `cd frontend && npm start` |
| Rebuild native app (after adding native deps or changing `app.json`) | `cd frontend && npx expo run:ios` |
| All frontend checks | `cd frontend && npm run check` |
| Format frontend | `cd frontend && npm run format` |
| All backend checks | `cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest -q` |
| Regenerate sample tones | `cd frontend && npm run generate:samples` |

**Try the player without the backend.** In a development build, open **Library**, then tap **Load sample library**. You can also use **Settings → Developer**. This copies four synthetic, copyright-free tones into private storage so you can test playback, playlists, the queue and lock-screen controls offline.

## Testing

```bash
cd backend && uv run pytest -q     # API, providers, jobs, security; no network (fake provider)
cd frontend && npm test            # SQLite (real schema via better-sqlite3), queue, player, downloads, API
```

What's automated:

- **URL validation.** Client-side checks with zod. Server-side canonicalization rebuilds the URL from an 11-character ID.
- **Metadata parsing and backend error mapping.** Covers private, deleted, restricted, too-long and unsupported media.
- **Download states and the full import pipeline.** Duplicate detection, insufficient storage, interruptions, corrupted files, cancellation, retry, and resume after relaunch.
- **SQLite CRUD.** Playlists, adding, removing and reordering tracks, and FK cascades on delete.
- **Filesystem.** Cleanup, orphan pruning, and offline playback path resolution, which never uses a remote URL.
- **Player behaviour.** Background status handling, **native remote next/previous events** (driven without any UI mounted), foreground sync, and **queue restoration**.

Lock Screen, Control Center, Bluetooth and true backgrounding need a real device. Use the manual plan in [`docs/QA_CHECKLIST.md`](docs/QA_CHECKLIST.md).

CI (GitHub Actions) runs all backend and frontend checks plus a Docker build on every push and pull request.

## Project structure

```
frontend/
  index.ts                     Entry: registers the playback service outside React, then Expo Router
  modules/audiovault-remote-commands/   Local Expo module (Swift): Lock Screen next/previous
  src/
    app/                       Routes only (thin re-exports of feature screens)
    components/                Shared UI (ui/, songs/, playlists/, player/, layout/)
    features/                  downloads/ home/ library/ player/ playlists/ search/ settings/
    services/
      api/                     Typed API client + zod schemas + config (Keychain)
      audio/                   AudioService (player.ts), queueManager, expo-audio engine, playbackService
      database/                Migrations, connection, repositories
      filesystem/              Private music storage
    store/                     Zustand stores (library, player, downloads)
    types/ utils/ theme/ navigation/ test-utils/
backend/
  app/
    api/routes/                /health and /api/media/*
    providers/                 MediaProvider base, registry, YouTube provider
    services/media/            Job store, job runner, media service
    core/                      Config, errors, security, rate limit, middleware, logging
  tests/
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the pipeline, each phase's files and responsibilities, and the decisions behind them.

### API

All `/api/media/*` routes need the `X-API-Key` header.

| Method & path | Purpose |
|---|---|
| `POST /api/media/metadata` `{url}` | Title, creator, thumbnail, duration |
| `POST /api/media/download` `{url, format:"mp3"}` | Starts a job and returns `jobId` + one-time `downloadToken` |
| `GET /api/media/jobs/{jobId}` | `status` (queued / processing / complete / failed), `stage`, `progress` |
| `GET /api/media/jobs/{jobId}/file?token=…` | The finished MP3 |
| `DELETE /api/media/jobs/{jobId}` | Acknowledge (or cancel). The server deletes its temp file |
| `GET /health` | Liveness and enabled providers (no auth) |

Errors always look like `{"error": {"code": "...", "message": "..."}}`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `simctl` / `expo run:ios` hangs | Run `sudo xcodebuild -runFirstLaunch` (see [setup](#one-time-machine-setup)) |
| `pod install`: ``undefined method `visionos'`` or `filter_map` | CocoaPods too old: `brew install cocoapods` |
| App says "Can't reach the AudioVault server" | Backend running? On a phone, use the LAN IP, not localhost; allow Local Network permission; same Wi-Fi |
| "The server rejected the API key" | Key in Settings must equal `API_KEY` in `backend/.env` |
| Metadata works but downloads fail with `provider_error` | YouTube changes often. Rebuild the image to update yt-dlp: `docker compose build --no-cache` |
| Metro/Jest oddities on Node 25 | Use Node 22/24 LTS (`nvm use 22`) |
| Changed `app.json` / added a native package and nothing changed | Re-run `npx expo run:ios` (native rebuild) |

## Known limitations

- **Android next/previous on the system media controls.** expo-audio's Android media session removes track-navigation commands. Play/pause, seek and background playback work through its foreground service, but next/previous from the notification need a patch to expo-audio's `AudioMediaSessionCallback`. That patch isn't included because it can't be verified without an Android toolchain. See ARCHITECTURE.md → *Audio*.
- **iCloud backup.** Music lives in the app's Documents sandbox (private, not visible in Files), which iOS backs up by default. Excluding it from backup needs a small native call. This is a follow-up before App Store submission.
- **Backend scaling.** Jobs are in-process and in-memory: one instance, and jobs are lost on restart. The provider and job-store interfaces are where Redis/a worker queue would go.
- **Auth.** A single shared API key suits a personal deployment. Multi-user or commercial use needs per-user auth (e.g. OAuth/JWT) and HTTPS.
- **Background downloads** keep transferring the MP3 while the app is suspended (iOS background URLSession). Server-side progress polling resumes when you return to the app.
