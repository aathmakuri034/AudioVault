import { create } from 'zustand';

import type { RepeatMode, Song } from '@/types/models';

/**
 * Read-only snapshot of playback for the UI. Only AudioService writes here;
 * components subscribe to the slices they render and call AudioService to act.
 */
export type PlayerState = {
  currentSong: Song | null;
  /** Full queue in play order and the current index within it. */
  queue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  canGoNext: boolean;
  canGoPrevious: boolean;
  /** User-facing playback problem, e.g. a missing file. Cleared on next load. */
  error: string | null;
};

export const initialPlayerState: PlayerState = {
  currentSong: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  isBuffering: false,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  canGoNext: false,
  canGoPrevious: false,
  error: null,
};

export const usePlayerStore = create<PlayerState>(() => initialPlayerState);
