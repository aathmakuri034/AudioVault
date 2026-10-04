import { createRepositories, type Repositories } from '@/services/database/repositories';
import { MissingAudioFileError } from '@/services/filesystem/musicStorage';
import { initialPlayerState, usePlayerStore } from '@/store/playerStore';
import { FakeAudioEngine, flush } from '@/test-utils/fakeAudioEngine';
import { makeSong } from '@/test-utils/fixtures';
import { createTestDb } from '@/test-utils/sqliteTestDb';
import type { Song } from '@/types/models';

import { AudioService } from '../player';

jest.mock('expo-file-system', () => require('@/test-utils/fakeFileSystem').fakeExpoFileSystem);
jest.mock('expo-sqlite', () => ({}));

type Setup = {
  engine: FakeAudioEngine;
  audio: AudioService;
  repos: Repositories;
  songs: Song[];
  missing: Set<string>;
  clock: { now: number };
};

async function setup(count = 3, repos?: Repositories): Promise<Setup> {
  usePlayerStore.setState(initialPlayerState, true);
  const r = repos ?? createRepositories(await createTestDb());
  const songs: Song[] = [];
  if (!repos) {
    for (let i = 0; i < count; i += 1) {
      songs.push(
        await r.songs.insert(makeSong({ id: `song-${i}`, title: `Track ${i}`, duration: 100 })),
      );
    }
  }
  const engine = new FakeAudioEngine();
  const missing = new Set<string>();
  const clock = { now: 1_000 };
  const audio = new AudioService({
    engine,
    getRepositories: async () => r,
    resolveUri: (song) => {
      if (missing.has(song.id)) throw new MissingAudioFileError(song.id);
      return song.localAudioUri;
    },
    now: () => clock.now,
    random: () => 0,
  });
  audio.attach();
  return { engine, audio, repos: r, songs, missing, clock };
}

const state = () => usePlayerStore.getState();

describe('AudioService playback', () => {
  it('plays from the local file URI and publishes state', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs, 1);

    expect(engine.current?.uri).toBe(songs[1].localAudioUri);
    expect(engine.current?.uri.startsWith('file://')).toBe(true);
    expect(engine.loaded.at(-1)?.autoplay).toBe(true);
    expect(state().currentSong?.id).toBe('song-1');
    expect(state().queueIndex).toBe(1);
    expect(engine.remoteNavigation).toEqual({ canGoNext: true, canGoPrevious: true });
  });

  it('play/pause toggles the engine', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs);
    audio.togglePlayPause();
    expect(engine.status.isPlaying).toBe(false);
    audio.togglePlayPause();
    expect(engine.status.isPlaying).toBe(true);
  });

  it('next / previous move through the queue; previous restarts after 3s', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs);
    await audio.next();
    expect(engine.current?.id).toBe('song-1');

    engine.status.position = 10;
    await audio.previous();
    expect(engine.current?.id).toBe('song-1');
    expect(engine.seeks.at(-1)).toBe(0);

    engine.status.position = 1;
    await audio.previous();
    expect(engine.current?.id).toBe('song-0');
  });

  it('seeks and skips within bounds', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs);
    engine.status.duration = 100;
    await audio.seekTo(150);
    expect(engine.seeks.at(-1)).toBe(100);
    engine.status.position = 5;
    await audio.skipBy(-10);
    expect(engine.seeks.at(-1)).toBe(0);
  });

  it('shuffle and repeat are reflected in state', async () => {
    const { audio, songs } = await setup();
    await audio.playSongs(songs);
    audio.toggleShuffle();
    audio.cycleRepeat();
    expect(state()).toMatchObject({ shuffle: true, repeat: 'all' });
    expect(state().currentSong?.id).toBe('song-0');
  });
});

describe('AudioService track end', () => {
  it('advances automatically when a track finishes', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs);
    engine.finishTrack();
    await flush();
    expect(engine.current?.id).toBe('song-1');
    expect(engine.loaded.at(-1)?.autoplay).toBe(true);
  });

  it('repeat one replays the same track without reloading', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs);
    audio.cycleRepeat();
    audio.cycleRepeat();
    const loads = engine.loaded.length;
    engine.finishTrack();
    await flush();
    expect(engine.loaded.length).toBe(loads);
    expect(engine.seeks.at(-1)).toBe(0);
    expect(engine.status.isPlaying).toBe(true);
  });

  it('repeat all wraps to the first track', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs, 2);
    audio.cycleRepeat();
    engine.finishTrack();
    await flush();
    expect(engine.current?.id).toBe('song-0');
  });

  it('stops and rewinds at the end of the queue with repeat off', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs, 2);
    engine.finishTrack();
    await flush();
    expect(engine.current?.id).toBe('song-2');
    expect(engine.status.isPlaying).toBe(false);
    expect(state().isPlaying).toBe(false);
  });
});

describe('native remote commands (Lock Screen / Control Center / headset)', () => {
  it('handles next and previous without any UI mounted', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs);
    engine.emitRemote('next');
    await flush();
    expect(engine.current?.id).toBe('song-1');
    expect(state().currentSong?.id).toBe('song-1');

    engine.status.position = 0;
    engine.emitRemote('previous');
    await flush();
    expect(engine.current?.id).toBe('song-0');
  });

  it('disables remote next at the end of the queue', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs, 2);
    expect(engine.remoteNavigation.canGoNext).toBe(false);
    audio.cycleRepeat();
    expect(engine.remoteNavigation.canGoNext).toBe(true);
  });

  it('stops listening after detach', async () => {
    const { engine, audio } = await setup();
    expect(engine.listenerCount).toBe(2);
    audio.detach();
    expect(engine.listenerCount).toBe(0);
  });
});

describe('background playback and foreground sync', () => {
  it('keeps advancing from status events while backgrounded and syncs on return', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs);

    // App is backgrounded: the engine keeps playing and reporting status.
    engine.emitStatus({ position: 42, isPlaying: true });
    engine.finishTrack();
    await flush();
    engine.status = { ...engine.status, position: 12, isPlaying: true };

    const loads = engine.loaded.length;
    audio.syncFromEngine();
    expect(engine.loaded.length).toBe(loads); // returning never restarts the track
    expect(state()).toMatchObject({ position: 12, isPlaying: true });
    expect(state().currentSong?.id).toBe('song-1');
  });
});

describe('play history', () => {
  it('records one play per track load despite many status ticks', async () => {
    const { engine, audio, songs, repos } = await setup();
    await audio.playSongs(songs);
    engine.emitStatus({ isPlaying: true, position: 1 });
    engine.emitStatus({ isPlaying: true, position: 2 });
    await flush();
    expect((await repos.songs.getById('song-0'))?.playCount).toBe(1);
    expect((await repos.songs.getRecentlyPlayed()).map((s) => s.id)).toEqual(['song-0']);
  });
});

describe('queue restoration', () => {
  it('restores the queue paused at the saved position', async () => {
    const first = await setup();
    await first.audio.playSongs(first.songs, 1);
    first.audio.cycleRepeat();
    first.engine.emitStatus({ isPlaying: true, position: 37 });
    await first.audio.persist(true);

    const second = await setup(0, first.repos);
    await second.audio.restore();
    expect(second.engine.current?.id).toBe('song-1');
    expect(second.engine.loaded.at(-1)).toMatchObject({ autoplay: false, startAt: 37 });
    expect(state()).toMatchObject({ repeat: 'all', isPlaying: false, queueIndex: 1 });
  });

  it('restores nothing when there is no saved session', async () => {
    const { engine, audio } = await setup();
    await audio.restore();
    expect(engine.loaded).toEqual([]);
  });
});

describe('failure handling', () => {
  it('skips tracks whose files are missing and reports it', async () => {
    const { engine, audio, songs, missing } = await setup();
    missing.add('song-0');
    await audio.playSongs(songs);
    expect(engine.current?.id).toBe('song-1');
    expect(state().error).toMatch(/missing/);
    expect(state().queue.map((s) => s.id)).toEqual(['song-1', 'song-2']);
  });

  it('stops cleanly when every file is missing', async () => {
    const { engine, audio, songs, missing } = await setup();
    songs.forEach((s) => missing.add(s.id));
    await audio.playSongs(songs);
    expect(engine.loaded).toEqual([]);
    expect(engine.stopped).toBe(1);
    expect(state().currentSong).toBeNull();
  });

  it('moves on when the playing song is deleted', async () => {
    const { engine, audio, songs } = await setup();
    await audio.playSongs(songs);
    await audio.handleSongDeleted('song-0');
    expect(engine.current?.id).toBe('song-1');
    expect(state().queue).toHaveLength(2);
  });
});

describe('queue editing', () => {
  it('adds, plays next, reorders and removes', async () => {
    const { audio, songs, repos } = await setup();
    const extra = await repos.songs.insert(makeSong({ id: 'extra' }));
    await audio.playSongs(songs.slice(0, 2));
    audio.playNext(extra);
    audio.addToQueue(songs[2]);
    expect(state().queue.map((s) => s.id)).toEqual(['song-0', 'extra', 'song-1', 'song-2']);
    audio.moveInQueue(3, 1);
    expect(state().queue.map((s) => s.id)).toEqual(['song-0', 'song-2', 'extra', 'song-1']);
    await audio.removeFromQueue(2);
    expect(state().queue.map((s) => s.id)).toEqual(['song-0', 'song-2', 'song-1']);
    await audio.skipToQueueIndex(2);
    expect(state().currentSong?.id).toBe('song-1');
  });
});
