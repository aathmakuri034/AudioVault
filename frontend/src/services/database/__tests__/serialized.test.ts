import { makeSong } from '@/test-utils/fixtures';
import { createTestDb } from '@/test-utils/sqliteTestDb';

import { createPlaylistsRepository } from '../repositories/playlistsRepository';
import { createSongsRepository } from '../repositories/songsRepository';

describe('serialized database access', () => {
  it('keeps overlapping transactions from corrupting each other', async () => {
    const db = await createTestDb();
    const songs = createSongsRepository(db);
    const playlists = createPlaylistsRepository(db);
    const created = [];
    for (let i = 0; i < 5; i += 1) created.push(await songs.insert(makeSong()));
    const playlist = await playlists.create({ name: 'Mix' });

    // Rapid skipping (recordPlay transactions) racing playlist edits.
    await Promise.all([
      ...created.map((s, i) => songs.recordPlay(s.id, 1000 + i)),
      ...created.map((s) => playlists.addSong(playlist.id, s.id)),
      playlists.moveSong(playlist.id, 0, 0).catch(() => undefined),
    ]);

    const history = await db.getAllAsync('SELECT * FROM playback_history');
    expect(history).toHaveLength(5);
    expect((await playlists.getSongs(playlist.id)).map((s) => s.id)).toEqual(
      created.map((s) => s.id),
    );
  });

  it('rolls back only the failing transaction', async () => {
    const db = await createTestDb();
    const songs = createSongsRepository(db);
    const ok = await songs.insert(makeSong());

    const failing = db.withTransactionAsync(async (tx) => {
      await tx.runAsync('UPDATE songs SET play_count = 99 WHERE id = ?', [ok.id]);
      throw new Error('boom');
    });
    const succeeding = songs.recordPlay(ok.id, 5);

    await expect(failing).rejects.toThrow('boom');
    await succeeding;
    expect((await songs.getById(ok.id))?.playCount).toBe(1);
  });
});
