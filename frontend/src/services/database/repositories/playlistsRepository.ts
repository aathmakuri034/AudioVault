import type { Playlist, Song } from '@/types/models';
import { createId } from '@/utils/id';

import type { SqlDatabase } from '../types';
import { escapeLike } from './sql';
import { mapSong } from './songsRepository';

type PlaylistRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
  song_count: number;
  artwork_uri: string | null;
};

const SELECT_PLAYLIST = `
  SELECT p.*,
    (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) AS song_count,
    (SELECT s.local_artwork_uri FROM playlist_songs ps
       JOIN songs s ON s.id = ps.song_id
      WHERE ps.playlist_id = p.id AND s.local_artwork_uri IS NOT NULL
      ORDER BY ps.position LIMIT 1) AS artwork_uri
  FROM playlists p`;

function mapPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    songCount: row.song_count,
    artworkUri: row.artwork_uri,
  };
}

export const PLAYLIST_NAME_MAX = 100;

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Playlist name is required.');
  if (trimmed.length > PLAYLIST_NAME_MAX) throw new Error('Playlist name is too long.');
  return trimmed;
}

export function createPlaylistsRepository(db: SqlDatabase) {
  async function touch(playlistId: string, now: number) {
    await db.runAsync('UPDATE playlists SET updated_at = ? WHERE id = ?', [now, playlistId]);
  }

  async function rewritePositions(playlistId: string, songIds: string[]) {
    for (let i = 0; i < songIds.length; i += 1) {
      await db.runAsync(
        'UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND song_id = ?',
        [i, playlistId, songIds[i]],
      );
    }
  }

  async function orderedSongIds(playlistId: string): Promise<string[]> {
    const rows = await db.getAllAsync<{ song_id: string }>(
      'SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY position',
      [playlistId],
    );
    return rows.map((r) => r.song_id);
  }

  const repo = {
    async create(
      input: { name: string; description?: string | null },
      now = Date.now(),
    ): Promise<Playlist> {
      const id = createId();
      await db.runAsync(
        'INSERT INTO playlists (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, normalizeName(input.name), input.description?.trim() || null, now, now],
      );
      const playlist = await repo.getById(id);
      if (!playlist) throw new Error('Playlist insert failed.');
      return playlist;
    },

    async getById(id: string): Promise<Playlist | null> {
      const row = await db.getFirstAsync<PlaylistRow>(`${SELECT_PLAYLIST} WHERE p.id = ?`, [id]);
      return row ? mapPlaylist(row) : null;
    },

    async getAll(): Promise<Playlist[]> {
      const rows = await db.getAllAsync<PlaylistRow>(
        `${SELECT_PLAYLIST} ORDER BY p.updated_at DESC`,
      );
      return rows.map(mapPlaylist);
    },

    async update(
      id: string,
      changes: { name?: string; description?: string | null },
      now = Date.now(),
    ): Promise<void> {
      if (changes.name !== undefined) {
        await db.runAsync('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?', [
          normalizeName(changes.name),
          now,
          id,
        ]);
      }
      if (changes.description !== undefined) {
        await db.runAsync('UPDATE playlists SET description = ?, updated_at = ? WHERE id = ?', [
          changes.description?.trim() || null,
          now,
          id,
        ]);
      }
    },

    async delete(id: string): Promise<void> {
      // playlist_songs rows cascade; the songs themselves are untouched.
      await db.runAsync('DELETE FROM playlists WHERE id = ?', [id]);
    },

    async getSongs(playlistId: string): Promise<Song[]> {
      const rows = await db.getAllAsync<Parameters<typeof mapSong>[0]>(
        `SELECT s.* FROM playlist_songs ps
           JOIN songs s ON s.id = ps.song_id
          WHERE ps.playlist_id = ?
          ORDER BY ps.position`,
        [playlistId],
      );
      return rows.map(mapSong);
    },

    /** Appends a song. Returns false if it was already in the playlist. */
    async addSong(playlistId: string, songId: string, now = Date.now()): Promise<boolean> {
      let added = false;
      await db.withTransactionAsync(async () => {
        const result = await db.runAsync(
          `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position, added_at)
           VALUES (?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM playlist_songs WHERE playlist_id = ?), ?)`,
          [playlistId, songId, playlistId, now],
        );
        added = result.changes > 0;
        if (added) await touch(playlistId, now);
      });
      return added;
    },

    async removeSong(playlistId: string, songId: string, now = Date.now()): Promise<void> {
      await db.withTransactionAsync(async () => {
        const result = await db.runAsync(
          'DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
          [playlistId, songId],
        );
        if (result.changes === 0) return;
        await rewritePositions(playlistId, await orderedSongIds(playlistId));
        await touch(playlistId, now);
      });
    },

    /** Moves the song at `fromIndex` to `toIndex`, shifting the others. */
    async moveSong(
      playlistId: string,
      fromIndex: number,
      toIndex: number,
      now = Date.now(),
    ): Promise<void> {
      await db.withTransactionAsync(async () => {
        const ids = await orderedSongIds(playlistId);
        if (fromIndex < 0 || fromIndex >= ids.length || toIndex < 0 || toIndex >= ids.length) {
          throw new RangeError('Playlist position out of range.');
        }
        if (fromIndex === toIndex) return;
        const [moved] = ids.splice(fromIndex, 1);
        ids.splice(toIndex, 0, moved);
        await rewritePositions(playlistId, ids);
        await touch(playlistId, now);
      });
    },

    async getPlaylistIdsContaining(songId: string): Promise<string[]> {
      const rows = await db.getAllAsync<{ playlist_id: string }>(
        'SELECT playlist_id FROM playlist_songs WHERE song_id = ?',
        [songId],
      );
      return rows.map((r) => r.playlist_id);
    },

    /** Offline search by playlist name. */
    async search(query: string, limit = 20): Promise<Playlist[]> {
      const term = query.trim();
      if (!term) return [];
      const rows = await db.getAllAsync<PlaylistRow>(
        `${SELECT_PLAYLIST} WHERE p.name LIKE ? ESCAPE '\\' ORDER BY p.name COLLATE NOCASE LIMIT ?`,
        [`%${escapeLike(term)}%`, limit],
      );
      return rows.map(mapPlaylist);
    },
  };
  return repo;
}

export type PlaylistsRepository = ReturnType<typeof createPlaylistsRepository>;
