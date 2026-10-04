# AudioVault Manual QA Checklist

Lock Screen, Control Center, Bluetooth, real backgrounding and airplane mode can't be fully automated. Run this on a **physical iPhone** with a development or release build before each release. The Simulator can do most of it, but not real lock-screen or Bluetooth behaviour.

Setup: start the backend (`docker compose up`). Set the server address and API key in **Settings → Media server** and tap **Test connection**. Use media you own or have permission to download.

## MVP acceptance (spec "Version 1 is complete when…")

| # | Step | Expected | ✓ |
|---|---|---|---|
| 1 | Open the app | Splash, then Home with logo, URL field and empty state | |
| 2 | Paste an authorized URL, tap **Download Audio** | First time only: the consent dialog shows *"I confirm that I own this content or have permission to download and store it."* | |
| 3 | Confirm | The confirmation screen shows artwork, title, creator and duration | |
| 4 | Tap **Download Audio** | Download Details walks through Preparing → Downloading → Converting → Saving → Downloaded, and progress never goes backwards | |
| 5 | — | The MP3 is in private storage: it does **not** appear in the Files app, Music or any public folder | |
| 6 | Open **Library** | The track shows thumbnail, title, creator, duration, a red downloaded indicator and a ⋮ menu | |
| 7 | Enable **Airplane Mode** (Wi-Fi and cellular off) | — | |
| 8 | Tap the track | It plays immediately from the local file | |
| 9 | Lock the phone / switch to another app | Audio continues uninterrupted for 5+ minutes | |
| 10 | Lock Screen and Control Center | Title, creator, artwork, duration and a moving position. Play/pause, **next**, **previous** and scrubbing all work | |
| 11 | Library → Playlists → **New playlist** | The playlist is created (still offline) | |
| 12 | ⋮ → **Add to playlist** on 2+ tracks | They appear in the playlist in order | |
| 13 | Playlist → **Play** (still offline) | Plays in order. Next/previous from the Lock Screen move through the playlist | |
| 14 | Return to the app while playing | Now Playing shows the *same* track at the *current* position. Nothing restarts | |

## Playback

- [ ] Shuffle keeps the current song and randomizes the rest; turning it off restores the original order
- [ ] Repeat off: playback stops at the end and rewinds the last track
- [ ] Repeat all: the queue wraps around
- [ ] Repeat one: the track loops; **Next** still advances
- [ ] Previous restarts the track after 3 s; within 3 s it goes to the previous track
- [ ] ±15 s skip and slider scrubbing don't stutter or jump back
- [ ] Queue: tap to jump, reorder up/down, remove; Play next / Add to queue from ⋮
- [ ] Headphones (wired or AirPods): play/pause and double/triple-tap next/previous work
- [ ] Unplugging headphones / disconnecting Bluetooth pauses playback
- [ ] A phone call or Siri interrupts playback; it can be resumed afterwards
- [ ] Force-quit and relaunch: the last queue is restored, **paused**, at the saved position
- [ ] CarPlay (if available): now playing info and transport controls work

## Downloads and errors

- [ ] Invalid text → "Enter a valid web link…" (no server call)
- [ ] Unsupported site → "This link isn't supported…"
- [ ] Private / deleted / age-restricted media → a specific message; the app doesn't crash
- [ ] The same track again → "This track has already been downloaded."
- [ ] Backend stopped → "Can't reach the AudioVault server…"
- [ ] Wrong API key → "The server rejected the API key. Check Settings."
- [ ] Cancel mid-download → "Download cancelled."; no partial file is left behind; the server job is deleted
- [ ] Turn Wi-Fi off mid-transfer → "Your download was interrupted. Try again." → **Try again** finishes it
- [ ] Background the app during a download, return later → it finishes or continues
- [ ] Device nearly full → "Not enough storage is available on your device."
- [ ] Over 30 minutes → the server's "longer than 30 minutes" message

## Library, playlists, search

- [ ] Favorite / unfavorite from ⋮ and from Now Playing; Home → Favorite Songs updates
- [ ] Delete a song that's in a playlist and currently playing → playback moves on; the song is gone from the library, playlists and search
- [ ] Rename, edit the description of, and delete a playlist (its songs stay in the library)
- [ ] Reorder and remove songs in Playlist → ⋯ → Reorder / remove
- [ ] Search by title, creator and playlist name in Airplane Mode
- [ ] Home shelves: Recently Played updates after playing; Recently Downloaded after importing

## Accessibility and layout

- [ ] VoiceOver reads every button (play, next, ⋮, the now-playing pill) with a meaningful label
- [ ] Dynamic Type at the largest size: no clipped primary actions
- [ ] iPhone SE-sized and Pro Max-sized screens: nothing overlaps the notch or home indicator
