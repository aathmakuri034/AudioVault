/**
 * The playback engine contract. AudioService talks only to this interface,
 * so the native library (expo-audio today) can be swapped, and the service
 * can be tested with a fake engine.
 */
export type EngineTrack = {
  id: string;
  /** Local file:// URI. Remote URLs are never loaded. */
  uri: string;
  title: string;
  artist: string;
  artworkUri: string | null;
  duration: number | null;
};

export type EngineStatus = {
  isLoaded: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  /** Seconds. */
  position: number;
  /** Seconds; 0 until known. */
  duration: number;
  /** True once, right after the loaded track reached its end. */
  didJustFinish: boolean;
  error: string | null;
};

export type RemoteCommand = 'next' | 'previous';

export interface AudioEngine {
  /** One-time audio session setup (background playback, interruptions). */
  configure(): Promise<void>;
  /** Replaces the current track. Publishes Now Playing metadata. */
  load(track: EngineTrack, options: { autoplay: boolean; startAt?: number }): void;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  getStatus(): EngineStatus;
  /** Updates which system next/previous buttons are enabled. */
  setRemoteNavigation(canGoNext: boolean, canGoPrevious: boolean): void;
  /** Stops playback and removes system Now Playing controls. */
  stop(): void;
  onStatus(listener: (status: EngineStatus) => void): () => void;
  onRemoteCommand(listener: (command: RemoteCommand) => void): () => void;
}
