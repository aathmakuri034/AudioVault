import type { NewSong } from '@/types/models';

let counter = 0;

/** Builds a valid NewSong; override any field. Source ids are unique per call. */
export function makeSong(overrides: Partial<NewSong> = {}): NewSong {
  counter += 1;
  const id = overrides.id ?? `song-${counter}`;
  return {
    id,
    provider: 'youtube',
    sourceId: `src${String(counter).padStart(8, '0')}`,
    sourceUrl: `https://www.youtube.com/watch?v=src${String(counter).padStart(8, '0')}`,
    title: `Song ${counter}`,
    creator: `Creator ${counter}`,
    duration: 180,
    thumbnailUrl: null,
    localAudioUri: `file:///data/music/${id}.mp3`,
    localArtworkUri: `file:///data/music/${id}.jpg`,
    fileSize: 1_000_000,
    ...overrides,
  };
}
