import { makeSong } from '@/test-utils/fixtures';
import { createTestDb } from '@/test-utils/sqliteTestDb';

import { createPlaylistsRepository } from '../repositories/playlistsRepository';
import { createSongsRepository } from '../repositories/songsRepository';

async function setup(songCount = 0) {
  const db = await createTestDb();
  const songs = createSongsRepository(db);
  const playlists = createPlaylistsRepository(db);
  const created = [];
  for (let i = 0; i < songCount; i += 1) created.push(await songs.insert(makeSong()));
  return { db, songs, playlists, created };
}

const titles = (list: { id: string }[]) => list.map((s) => s.id);

describe('playlistsRepository', () => {
  it('creates a playlist with trimmed name and timestamps', async () => {
    const { playlists } = await setup();
    const p = await playlists.create({ name: '  Road Trip ', description: ' ' }, 10);
    expect(p).toMatchObject({
      name: 'Road Trip',
      description: null,
      createdAt: 10,
      updatedAt: 10,
      songCount: 0,
      artworkUri: null,
    });
  });

  it('validates names', async () => {
    const { playlists } = await setup();
    await expect(playlists.create({ name: '   ' })).rejects.toThrow(/required/);
    await expect(playlists.create({ name: 'x'.repeat(101) })).rejects.toThrow(/too long/);
  });

  it('renames and updates description', async () => {
    const { playlists } = await setup();
    const p = await playlists.create({ name: 'Old' }, 1);
    await playlists.update(p.id, { name: 'New', description: 'Chill' }, 5);
    expect(await playlists.getById(p.id)).toMatchObject({
      name: 'New',
      description: 'Chill',
      updatedAt: 5,
    });
  });

  it('adds songs in order, ignores duplicates, and reports count and artwork', async () => {
    const { playlists, created } = await setup(3);
    const p = await playlists.create({ name: 'Mix' });
    expect(await playlists.addSong(p.id, created[0].id)).toBe(true);
    expect(await playlists.addSong(p.id, created[1].id)).toBe(true);
    expect(await playlists.addSong(p.id, created[0].id)).toBe(false);
    expect(titles(await playlists.getSongs(p.id))).toEqual([created[0].id, created[1].id]);
    expect(await playlists.getById(p.id)).toMatchObject({
      songCount: 2,
      artworkUri: created[0].localArtworkUri,
    });
  });

  it('removes a song and compacts positions', async () => {
    const { db, playlists, created } = await setup(3);
    const p = await playlists.create({ name: 'Mix' });
    for (const s of created) await playlists.addSong(p.id, s.id);
    await playlists.removeSong(p.id, created[1].id);
    expect(titles(await playlists.getSongs(p.id))).toEqual([created[0].id, created[2].id]);
    const positions = await db.getAllAsync<{ position: number }>(
      'SELECT position FROM playlist_songs WHERE playlist_id = ? ORDER BY position',
      [p.id],
    );
    expect(positions.map((r) => r.position)).toEqual([0, 1]);
  });

  it('reorders songs', async () => {
    const { playlists, created } = await setup(4);
    const p = await playlists.create({ name: 'Mix' });
    for (const s of created) await playlists.addSong(p.id, s.id);
    await playlists.moveSong(p.id, 0, 2);
    expect(titles(await playlists.getSongs(p.id))).toEqual([
      created[1].id,
      created[2].id,
      created[0].id,
      created[3].id,
    ]);
    await playlists.moveSong(p.id, 3, 0);
    expect(titles(await playlists.getSongs(p.id))[0]).toBe(created[3].id);
    await expect(playlists.moveSong(p.id, 0, 9)).rejects.toBeInstanceOf(RangeError);
  });

  it('deleting a playlist keeps its songs', async () => {
    const { db, songs, playlists, created } = await setup(1);
    const p = await playlists.create({ name: 'Mix' });
    await playlists.addSong(p.id, created[0].id);
    await playlists.delete(p.id);
    expect(await playlists.getById(p.id)).toBeNull();
    expect(await songs.getById(created[0].id)).not.toBeNull();
    expect(await db.getAllAsync('SELECT * FROM playlist_songs')).toEqual([]);
  });

  it('rejects adding a song that does not exist', async () => {
    const { playlists } = await setup();
    const p = await playlists.create({ name: 'Mix' });
    await expect(playlists.addSong(p.id, 'missing')).rejects.toThrow();
  });

  it('lists playlists containing a song and searches by name', async () => {
    const { playlists, created } = await setup(1);
    const a = await playlists.create({ name: 'Workout' });
    await playlists.create({ name: 'Sleep' });
    await playlists.addSong(a.id, created[0].id);
    expect(await playlists.getPlaylistIdsContaining(created[0].id)).toEqual([a.id]);
    expect((await playlists.search('work')).map((p) => p.name)).toEqual(['Workout']);
    expect(await playlists.search('')).toEqual([]);
  });

  it('orders playlists by most recently updated', async () => {
    const { playlists } = await setup();
    const a = await playlists.create({ name: 'A' }, 1);
    await playlists.create({ name: 'B' }, 2);
    await playlists.update(a.id, { name: 'A2' }, 3);
    expect((await playlists.getAll()).map((p) => p.name)).toEqual(['A2', 'B']);
  });
});
