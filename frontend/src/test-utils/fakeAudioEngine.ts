import type {
  AudioEngine,
  EngineStatus,
  EngineTrack,
  RemoteCommand,
} from '@/services/audio/engine';

/**
 * Scriptable AudioEngine for tests. It records commands and lets tests emit
 * status updates and native remote commands (Lock Screen / Control Center)
 * the way the real engine would, even with no React tree mounted.
 */
export class FakeAudioEngine implements AudioEngine {
  loaded: { track: EngineTrack; autoplay: boolean; startAt?: number }[] = [];
  seeks: number[] = [];
  remoteNavigation = { canGoNext: false, canGoPrevious: false };
  stopped = 0;
  status: EngineStatus = {
    isLoaded: false,
    isPlaying: false,
    isBuffering: false,
    position: 0,
    duration: 0,
    didJustFinish: false,
    error: null,
  };
  private statusListeners = new Set<(s: EngineStatus) => void>();
  private remoteListeners = new Set<(c: RemoteCommand) => void>();

  get current() {
    return this.loaded.at(-1)?.track ?? null;
  }

  async configure() {}

  load(track: EngineTrack, options: { autoplay: boolean; startAt?: number }) {
    this.loaded.push({ track, ...options });
    this.status = {
      ...this.status,
      isLoaded: true,
      isPlaying: options.autoplay,
      position: options.startAt ?? 0,
      duration: track.duration ?? 0,
    };
  }

  play() {
    this.status = { ...this.status, isPlaying: true };
  }

  pause() {
    this.status = { ...this.status, isPlaying: false };
  }

  async seekTo(seconds: number) {
    this.seeks.push(seconds);
    this.status = { ...this.status, position: seconds };
  }

  getStatus() {
    return { ...this.status, didJustFinish: false };
  }

  setRemoteNavigation(canGoNext: boolean, canGoPrevious: boolean) {
    this.remoteNavigation = { canGoNext, canGoPrevious };
  }

  stop() {
    this.stopped += 1;
    this.status = { ...this.status, isPlaying: false, isLoaded: false };
  }

  onStatus(listener: (s: EngineStatus) => void) {
    this.statusListeners.add(listener);
    return () => void this.statusListeners.delete(listener);
  }

  onRemoteCommand(listener: (c: RemoteCommand) => void) {
    this.remoteListeners.add(listener);
    return () => void this.remoteListeners.delete(listener);
  }

  // ---- test helpers

  /** Emits a status update as the native player would. */
  emitStatus(partial: Partial<EngineStatus>) {
    this.status = { ...this.status, ...partial };
    for (const l of this.statusListeners) l({ ...this.status });
    this.status = { ...this.status, didJustFinish: false };
  }

  /** Simulates the current track reaching its end. */
  finishTrack() {
    this.emitStatus({ position: this.status.duration, isPlaying: false, didJustFinish: true });
  }

  /** Simulates a Lock Screen / Control Center / headset button press. */
  emitRemote(command: RemoteCommand) {
    for (const l of this.remoteListeners) l(command);
  }

  get listenerCount() {
    return this.statusListeners.size + this.remoteListeners.size;
  }
}

/** Lets pending promise chains (fire-and-forget handlers) settle. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));
