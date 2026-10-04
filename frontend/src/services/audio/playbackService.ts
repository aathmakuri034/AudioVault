import { AppState, type AppStateStatus } from 'react-native';

import { getRepositories } from '@/services/database/repositories';

import { ExpoAudioEngine } from './expoAudioEngine';
import { AudioService } from './player';

let service: AudioService | null = null;
let registered = false;
let playRecordedListener: (() => void) | undefined;

/** The app-wide AudioService singleton. */
export function getAudioService(): AudioService {
  service ??= new AudioService({
    engine: new ExpoAudioEngine(),
    getRepositories,
    onPlayRecorded: () => playRecordedListener?.(),
  });
  return service;
}

/** Lets the library refresh "Recently played" without a module cycle. */
export function setPlayRecordedListener(listener: () => void) {
  playRecordedListener = listener;
}

/**
 * Registers playback handling outside the React tree. Called from the app
 * entry point (index.ts) before any screen mounts, so native remote events
 * (Lock Screen, Control Center, headphones) and track-end handling keep
 * working whatever screen is visible, or none at all while backgrounded.
 */
export function registerPlaybackService() {
  if (registered) return;
  registered = true;
  const audio = getAudioService();
  audio.attach();
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      // Returning to the app: reflect real playback state, never restart.
      audio.syncFromEngine();
    } else if (state === 'background') {
      void audio.persist(true);
    }
  });
}
