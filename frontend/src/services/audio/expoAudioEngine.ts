import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';

import type { AudioEngine, EngineStatus, EngineTrack, RemoteCommand } from './engine';
import {
  addRemoteNavigationListener,
  disableRemoteNavigation,
  setRemoteNavigationEnabled,
} from './remoteCommands';

const STATUS_INTERVAL_MS = 500;

/**
 * expo-audio implementation of {@link AudioEngine}.
 *
 * One long-lived AudioPlayer is reused for every track (`replace`), so it
 * stays the active Now Playing player. Background playback, Lock Screen /
 * Control Center metadata, play/pause and scrubbing come from expo-audio;
 * next/previous come from the local remote-commands module.
 */
export class ExpoAudioEngine implements AudioEngine {
  private player: AudioPlayer | null = null;
  private lockScreenActive = false;
  private statusListeners = new Set<(status: EngineStatus) => void>();
  private lastStatus: EngineStatus = EMPTY_STATUS;

  async configure() {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      // Required for Lock Screen controls; pauses other apps' audio.
      interruptionMode: 'doNotMix',
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
  }

  private ensurePlayer(): AudioPlayer {
    if (this.player) return this.player;
    const player = createAudioPlayer(null, {
      updateInterval: STATUS_INTERVAL_MS,
      // Keep the session (and Lock Screen controls) alive while paused.
      keepAudioSessionActive: true,
    });
    player.addListener('playbackStatusUpdate', (status) => {
      this.lastStatus = toEngineStatus(status);
      for (const listener of this.statusListeners) listener(this.lastStatus);
    });
    this.player = player;
    return player;
  }

  load(track: EngineTrack, { autoplay, startAt }: { autoplay: boolean; startAt?: number }) {
    const player = this.ensurePlayer();
    player.replace({ uri: track.uri, name: track.title });
    const metadata = {
      title: track.title,
      artist: track.artist,
      albumTitle: 'AudioVault',
      artworkUrl: track.artworkUri ?? undefined,
    };
    if (!this.lockScreenActive) {
      // Hide ±10s skip buttons so iOS shows next/previous track buttons instead.
      player.setActiveForLockScreen(true, metadata, {
        showSeekForward: false,
        showSeekBackward: false,
      });
      this.lockScreenActive = true;
    } else {
      player.updateLockScreenMetadata(metadata);
    }
    if (startAt && startAt > 0) void player.seekTo(startAt);
    if (autoplay) player.play();
  }

  play() {
    this.player?.play();
  }

  pause() {
    this.player?.pause();
  }

  async seekTo(seconds: number) {
    await this.player?.seekTo(Math.max(0, seconds));
  }

  getStatus(): EngineStatus {
    const player = this.player;
    if (!player) return EMPTY_STATUS;
    return {
      ...this.lastStatus,
      isLoaded: player.isLoaded,
      isPlaying: player.playing,
      isBuffering: player.isBuffering,
      position: player.currentTime,
      duration: player.duration,
      didJustFinish: false,
    };
  }

  setRemoteNavigation(canGoNext: boolean, canGoPrevious: boolean) {
    setRemoteNavigationEnabled(canGoNext, canGoPrevious);
  }

  stop() {
    if (!this.player) return;
    this.player.pause();
    // Deliberately not clearLockScreenControls(): expo-audio re-adds its
    // play/pause targets on the next setActiveForLockScreen without removing
    // the old block-based ones, so headset toggles would fire twice.
    disableRemoteNavigation();
  }

  onStatus(listener: (status: EngineStatus) => void) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  onRemoteCommand(listener: (command: RemoteCommand) => void) {
    return addRemoteNavigationListener(listener);
  }
}

const EMPTY_STATUS: EngineStatus = {
  isLoaded: false,
  isPlaying: false,
  isBuffering: false,
  position: 0,
  duration: 0,
  didJustFinish: false,
  error: null,
};

function toEngineStatus(status: AudioStatus): EngineStatus {
  return {
    isLoaded: status.isLoaded,
    isPlaying: status.playing,
    isBuffering: status.isBuffering,
    position: status.currentTime,
    duration: status.duration,
    didJustFinish: status.didJustFinish,
    error: status.error ?? null,
  };
}
