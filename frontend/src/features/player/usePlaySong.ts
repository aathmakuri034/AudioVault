import { router } from 'expo-router';
import { useCallback } from 'react';

import { getAudioService } from '@/services/audio/playbackService';
import { usePlayerStore } from '@/store/playerStore';
import type { Song } from '@/types/models';

/**
 * Row-tap behaviour shared by every song list: tapping the active track opens
 * Now Playing; tapping any other song plays it with the list as the queue.
 */
export function usePlaySong(context: Song[]) {
  return useCallback(
    (song: Song) => {
      if (usePlayerStore.getState().currentSong?.id === song.id) {
        router.push('/now-playing');
        return;
      }
      void getAudioService().playSong(song, context);
    },
    [context],
  );
}
