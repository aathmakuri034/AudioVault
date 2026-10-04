You are a senior full-stack mobile engineer. I want you to design and implement a cross-platform mobile application for iOS and Android that functions as an offline-first music library and player.

The working project name can be `StreamStash`.

## Product Goal

Build a mobile music application where users can import audio from a supported public media URL when they have the legal right or permission to download that content.

For the initial implementation, support authorized YouTube URLs, such as content owned by the user or content the user otherwise has permission to download.

The application should process the media into an MP3 file, store the resulting audio inside the application's private local storage, and allow the user to listen to the downloaded music completely offline.

The application should feel similar to Spotify from a UX perspective while using a visual identity inspired by YouTube's red, black, white, and dark-gray color palette.

Do not copy Spotify or YouTube assets, logos, icons, or proprietary UI exactly. Create an original interface inspired by their general design principles.

## Technology Stack

### Mobile

Use:

- React Native
- TypeScript
- Expo using a Development Build where native modules are necessary
- Expo Router for navigation
- Zustand for application state
- React Native Track Player for music playback
- expo-file-system for private device storage
- expo-sqlite for local persistence
- Zod for client-side validation

### Backend

Use:

- Python
- FastAPI
- Pydantic
- yt-dlp for supported/authorized media extraction
- FFmpeg for audio conversion
- Docker

Design the backend so the media provider can eventually be changed without rewriting the mobile application.

Use a provider abstraction such as:

MediaProvider
    validateUrl()
    getMetadata()
    extractAudio()

Implement YouTube support as one provider rather than tightly coupling the application to YouTube.

## Core Requirement 1: URL Import

The Home screen should contain an input where a user can paste a supported URL.

Example:

https://www.youtube.com/watch?v=...

Provide a button:

"Download Audio"

When pressed:

1. Validate the URL.
2. Send the URL to the backend.
3. Retrieve metadata including:
   - title
   - creator/channel
   - thumbnail
   - duration
4. Present the user with a confirmation screen.
5. Start the audio processing job.
6. Extract the audio.
7. Convert it into MP3.
8. Return the finished audio file to the mobile application.
9. Download it into the application's private storage.
10. Save its metadata into the local SQLite database.

The MP3 should NOT automatically appear in:

- iOS Files
- Android Downloads
- Android Music
- the user's public media folders

The audio should belong to the application's private library.

Provide clear download states:

- validating
- preparing
- downloading
- processing
- saving
- completed
- failed

Show progress where technically possible.

Prevent duplicate downloads using the source URL or source media ID.

## Core Requirement 2: Local Music Library

Create a Library screen.

Downloaded songs should appear as rows/cards containing:

- Thumbnail
- Song title
- Creator/artist/channel
- Duration
- Downloaded indicator
- Three-dot menu

Users should be able to:

- play a song
- pause a song
- delete a song
- add a song to a playlist
- remove a song from a playlist
- favorite a song
- view song information

Deleting a song should remove:

1. the physical local MP3 file
2. its associated local database record
3. playlist references

## Core Requirement 3: Offline and Background Playback

After a song is downloaded, the application must be able to play the song with absolutely no internet connection.

Playback must use the local device URI rather than the original remote URL.

Support:

- play
- pause
- seek
- skip forward
- skip backward
- next song
- previous song
- shuffle
- repeat one
- repeat playlist
- queue management

Playback must continue when:

- the phone screen is locked
- the application is backgrounded
- the user switches to another application

The application must integrate with native media playback controls.

### iOS

The currently playing song should appear in:

- Lock Screen media controls
- Control Center
- Bluetooth/headphone controls
- CarPlay-compatible media controls where supported by the audio framework

The user should be able to:

- play/pause
- skip to the next track
- return to the previous track
- seek where supported

Display native Now Playing metadata including:

- title
- creator/artist
- artwork
- playback duration
- current playback position

### Android

The currently playing song should integrate with:

- Android media notifications
- Lock Screen controls
- Quick Settings / media controls
- Bluetooth/headphone controls
- Android Auto-compatible controls where supported by the audio framework

The user should be able to:

- play/pause
- next
- previous
- seek where supported

Display:

- title
- creator/artist
- artwork
- playback state
- progress

Use the proper Android foreground media playback service so audio is not unexpectedly terminated while the application is backgrounded.

### Important UI Requirement

Do NOT create a persistent mini-player solely for the purpose of background playback.

When the application is backgrounded, playback controls should be handled through the operating system's native media interface:

iOS:
Control Center / Lock Screen

Android:
Media notification / system media controls

The application does not need to display its own interface while backgrounded.

When the user returns to the application, the UI should synchronize with the current audio player state.

## Core Requirement 4: Now Playing Screen

Create a full-screen player similar in information hierarchy to modern music streaming applications.

Display:

- large album/video artwork
- song title
- creator
- progress slider
- current playback position
- remaining/total duration
- previous button
- play/pause button
- next button
- shuffle button
- repeat button
- playlist/queue button

Use animated transitions where appropriate.

If a song is already playing when the user returns from the background, the Now Playing screen should reflect the existing playback state rather than restarting the track.

## Core Requirement 5: Playlists

Users must be able to create custom playlists.

A playlist should contain:

- id
- name
- optional description
- created date
- updated date
- song count
- optional artwork

Users should be able to:

- create playlists
- rename playlists
- delete playlists
- add songs
- remove songs
- reorder songs
- play an entire playlist
- shuffle a playlist

All playlist information must work offline and persist in SQLite.

## Core Requirement 6: Search

Create a Search tab.

Search locally downloaded content by:

- title
- creator
- playlist name

Search must work without internet access.

Do not perform a YouTube search in version 1.

## Application Navigation

Use bottom-tab navigation.

Tabs:

Home
Search
Library

Additional screens:

- Now Playing
- Playlist Details
- Create Playlist
- Song Details
- Download Details
- Settings

A persistent mini-player is not required.

The currently active song should instead be accessible through appropriate navigation from the Library, Home screen, or other relevant in-app music interfaces.

Background playback state must continue independently of the currently visible screen.

## Home Screen

The Home screen should include:

- App logo/name
- URL input
- Download Audio button
- Recently Played
- Recently Downloaded
- Favorite Songs
- Playlists

If nothing has been downloaded yet, provide an attractive empty state encouraging the user to import their first authorized track.

## Visual Design

The application's UX should be inspired by Spotify's clean music-player layout while using an original design.

Use approximately:

Background:
#0F0F0F

Cards:
#181818

Elevated surfaces:
#212121

Primary accent:
#FF0000

Secondary red:
#CC0000

Primary text:
#FFFFFF

Secondary text:
#AAAAAA

Use:

- rounded cards
- large album artwork
- subtle shadows
- smooth animations
- modern typography
- minimal visual clutter
- large touch targets

The primary action color should be YouTube-inspired red instead of Spotify green.

Do not copy Spotify's UI pixel-for-pixel.

## Local Storage Architecture

Store downloaded audio inside a dedicated private application directory such as:

/music/

Suggested structure:

/music/
    {songId}.mp3
    {songId}.jpg

Store song metadata in SQLite.

Create tables similar to:

songs

id
source_id
source_url
title
creator
duration
thumbnail_url
local_audio_uri
local_artwork_uri
file_size
date_downloaded
last_played
play_count
is_favorite

playlists

id
name
description
created_at
updated_at

playlist_songs

playlist_id
song_id
position
added_at

playback_history

id
song_id
played_at

Add appropriate foreign keys and indexes.

## Audio Player Architecture

The audio player should be treated as an application-level service rather than being tied to a single React component.

Create a centralized audio service responsible for:

- loading tracks
- managing queues
- playback state
- play/pause
- next/previous
- seeking
- repeat modes
- shuffle
- native media events
- background playback

Example structure:

services/
    audio/
        player.ts
        playbackService.ts
        queueManager.ts

Register the React Native Track Player playback service outside the main React component tree where required.

Native playback events should continue to function when React Native screens are not actively visible.

Handle events such as:

- RemotePlay
- RemotePause
- RemoteNext
- RemotePrevious
- RemoteSeek
- playback state changes
- active track changes

Application UI components should subscribe to the central player state rather than directly owning playback.

## Backend API

Create endpoints similar to:

POST /api/media/metadata

Request:

{
    "url": "..."
}

Response:

{
    "sourceId": "...",
    "title": "...",
    "creator": "...",
    "thumbnail": "...",
    "duration": 240
}

POST /api/media/download

Request:

{
    "url": "...",
    "format": "mp3"
}

The endpoint should process the media and return or expose the finished MP3 through a temporary authenticated download endpoint.

GET /api/media/jobs/{jobId}

Return:

{
    "status": "processing",
    "progress": 50
}

Possible statuses:

queued
processing
complete
failed

GET /api/media/jobs/{jobId}/file

Return the generated audio file after processing completes.

Delete temporary server-side media after the mobile device successfully downloads it or after a configured expiration period.

## Backend Processing Pipeline

The desired processing pipeline is:

User URL
    ↓
Mobile App
    ↓
FastAPI
    ↓
URL Validation
    ↓
Media Provider
    ↓
Metadata Extraction
    ↓
Audio Extraction
    ↓
FFmpeg
    ↓
MP3
    ↓
Temporary Server Storage
    ↓
Mobile Download
    ↓
Private App Storage
    ↓
SQLite Metadata
    ↓
Local Audio Player
    ↓
Native iOS/Android Media Controls

## Error Handling

Gracefully handle:

- invalid URL
- unsupported URL
- private media
- deleted media
- unavailable media
- network errors
- server errors
- conversion failures
- insufficient device storage
- duplicate downloads
- corrupted files
- user cancellation

Never crash the application because a download failed.

Show meaningful messages such as:

"Unable to process this URL."

"Not enough storage is available on your device."

"This track has already been downloaded."

"Your download was interrupted. Try again."

## Security

Never execute arbitrary shell commands directly from user input.

Validate and sanitize URLs.

Use subprocess argument arrays rather than shell interpolation when interacting with FFmpeg or other command-line utilities.

Implement:

- rate limiting
- request size restrictions
- timeouts
- temporary file cleanup
- safe filenames
- UUID-based internal filenames
- structured logging

Do not use video titles directly as filesystem paths.

## Copyright and Platform Compliance

The application should only process content that the user owns, has permission to download, or is otherwise legally permitted to download.

Include an acknowledgement before the first download:

"I confirm that I own this content or have permission to download and store it."

Design the media provider layer so a YouTube implementation can be disabled or replaced if distribution requirements, platform rules, or provider terms require it.

## Development Requirements

Use clean architecture and separate:

- UI components
- screens
- navigation
- services
- database layer
- filesystem layer
- audio player
- download manager
- API client
- state management
- types/models

Do not put the entire application inside one component.

Suggested mobile structure:

src/
    app/
    components/
    features/
        downloads/
        player/
        library/
        playlists/
        search/
    services/
        api/
        audio/
        database/
        filesystem/
    store/
    hooks/
    types/
    utils/

Suggested backend structure:

backend/
    app/
        main.py
        api/
        services/
            media/
        providers/
            base.py
            youtube.py
        models/
        schemas/
        core/
        utils/
    tests/
    Dockerfile

## Testing

Write tests for:

- URL validation
- metadata parsing
- download states
- SQLite CRUD operations
- playlist creation
- adding/removing tracks from playlists
- duplicate detection
- filesystem cleanup
- offline playback path resolution
- background playback
- lock screen controls
- native remote playback events
- queue restoration
- backend error handling

## MVP Definition

Version 1 is complete when a user can:

1. Open the application.
2. Paste an authorized supported media URL.
3. Retrieve the media information.
4. Convert/download the audio.
5. Save the MP3 inside private application storage.
6. See the track in their Library.
7. Disable Wi-Fi and cellular data.
8. Play the downloaded track successfully.
9. Background or lock the phone while playback continues.
10. Control play/pause/next/previous through iOS Control Center or Android system media controls.
11. Create a playlist.
12. Add downloaded tracks to the playlist.
13. Play the playlist completely offline.
14. Return to the application and see playback state synchronized correctly.

Build the application incrementally.

Start by creating:

1. project architecture
2. SQLite schema
3. navigation
4. mock music library
5. local audio playback
6. background audio and native media controls
7. playlist functionality
8. backend
9. media processing
10. download manager
11. complete UI polish

Do not begin by implementing every feature simultaneously.

For each phase, explain the files being created, their responsibilities, and any architectural decisions.

Keep in mind that I am using a 2020 Macbook Pro with an intel 15 processor. This app should be able to run on an iPhone 11 or newer
