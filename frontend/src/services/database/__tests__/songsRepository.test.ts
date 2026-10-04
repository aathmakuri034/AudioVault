import { makeSong } from '@/test-utils/fixtures';
import { createTestDb } from '@/test-utils/sqliteTestDb';

import { createPlaylistsRepository } from '../repositories/playlistsRepository';
import { DuplicateSongError, createSongsRepository } from '../repositories/songsRepository';

async function setup() {
  const db = await createTestDb();
  return { db, songs: createSongsRepository(db), playlists: createPlaylistsRepository(db) };
}

describe('songsRepository', () => {
  it('inserts and reads back a song with defaults', async () => {
    const { songs } = await setup();
    const input = makeSong({ title: 'Ocean Drive' });
    const saved = await songs.insert(input, 1000);
    expect(saved).toMatchObject({
      id: input.id,
      title: 'Ocean Drive',
      dateDownloaded: 1000,
      lastPlayed: null,
      playCount: 0,
      isFavorite: false,
    });
    expect(await songs.getById(input.id)).toEqual(saved);
  });

  it('rejects duplicates by provider + source id', async () => {
    const { songs } = await setup();
    const first = makeSong();
    await songs.insert(first);
    const dupe = makeSong({ sourceId: first.sourceId });
    await expect(songs.insert(dupe)).rejects.toBeInstanceOf(DuplicateSongError);
    expect(await songs.findBySource('youtube', first.sourceId)).not.toBeNull();
    expect(await songs.findBySourceUrl(first.sourceUrl)).not.toBeNull();
  });

  it('sorts the library', async () => {
    const { songs } = await setup();
    await songs.insert(makeSong({ title: 'beta', creator: 'Zed' }), 1);
    await songs.insert(makeSong({ title: 'Alpha', creator: 'Amy' }), 2);
    expect((await songs.getAll('recent')).map((s) => s.title)).toEqual(['Alpha', 'beta']);
    expect((await songs.getAll('title')).map((s) => s.title)).toEqual(['Alpha', 'beta']);
    expect((await songs.getAll('creator')).map((s) => s.creator)).toEqual(['Amy', 'Zed']);
  });

  it('toggles favorites', async () => {
    const { songs } = await setup();
    const s = await songs.insert(makeSong());
    await songs.setFavorite(s.id, true);
    expect((await songs.getFavorites()).map((x) => x.id)).toEqual([s.id]);
    await songs.setFavorite(s.id, false);
    expect(await songs.getFavorites()).toEqual([]);
  });

  it('records plays in counters and history', async () => {
    const { db, songs } = await setup();
    const s = await songs.insert(makeSong());
    await songs.recordPlay(s.id, 50);
    await songs.recordPlay(s.id, 60);
    const updated = await songs.getById(s.id);
    expect(updated).toMatchObject({ playCount: 2, lastPlayed: 60 });
    const history = await db.getAllAsync('SELECT * FROM playback_history');
    expect(history).toHaveLength(2);
    expect((await songs.getRecentlyPlayed()).map((x) => x.id)).toEqual([s.id]);
  });

  it('ignores plays for unknown songs', async () => {
    const { db, songs } = await setup();
    await songs.recordPlay('missing');
    expect(await db.getAllAsync('SELECT * FROM playback_history')).toEqual([]);
  });

  it('delete cascades to playlist references and history', async () => {
    const { db, songs, playlists } = await setup();
    const a = await songs.insert(makeSong());
    const b = await songs.insert(makeSong());
    const p = await playlists.create({ name: 'Mix' }, 1);
    await playlists.addSong(p.id, a.id, 2);
    await playlists.addSong(p.id, b.id, 3);
    await songs.recordPlay(a.id);

    const deleted = await songs.delete(a.id, 99);

    expect(deleted?.id).toBe(a.id);
    expect(await songs.getById(a.id)).toBeNull();
    expect((await playlists.getSongs(p.id)).map((s) => s.id)).toEqual([b.id]);
    expect(await db.getAllAsync('SELECT * FROM playback_history')).toEqual([]);
    expect((await playlists.getById(p.id))?.updatedAt).toBe(99);
    expect(await songs.delete('missing')).toBeNull();
  });

  it('searches title and creator offline, treating wildcards literally', async () => {
    const { songs } = await setup();
    await songs.insert(makeSong({ title: 'Midnight City', creator: 'M83' }));
    await songs.insert(makeSong({ title: 'Intro', creator: 'Midnight Band' }));
    await songs.insert(makeSong({ title: '100% Pure', creator: 'X' }));

    const byTitleFirst = await songs.search('midnight');
    expect(byTitleFirst.map((s) => s.title)).toEqual(['Midnight City', 'Intro']);
    expect((await songs.search('100%')).map((s) => s.title)).toEqual(['100% Pure']);
    expect(await songs.search('%')).toHaveLength(1);
    expect(await songs.search('   ')).toEqual([]);
  });

  it('preserves requested order in getByIds', async () => {
    const { songs } = await setup();
    const a = await songs.insert(makeSong());
    const b = await songs.insert(makeSong());
    expect((await songs.getByIds([b.id, 'gone', a.id])).map((s) => s.id)).toEqual([b.id, a.id]);
    expect(await songs.getByIds([])).toEqual([]);
  });

  it('sums storage used', async () => {
    const { songs } = await setup();
    expect(await songs.totalStorageBytes()).toBe(0);
    await songs.insert(makeSong({ fileSize: 10 }));
    await songs.insert(makeSong({ fileSize: 5 }));
    expect(await songs.totalStorageBytes()).toBe(15);
  });
});
