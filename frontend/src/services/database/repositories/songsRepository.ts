import type { NewSong, Song } from '@/types/models';

import type { SqlDatabase } from '../types';
import { escapeLike } from './sql';

type SongRow = {
  id: string;
  provider: string;
  source_id: string;
  source_url: string;
  title: string;
  creator: string;
  duration: number | null;
  thumbnail_url: string | null;
  local_audio_uri: string;
  local_artwork_uri: string | null;
  file_size: number | null;
  date_downloaded: number;
  last_played: number | null;
  play_count: number;
  is_favorite: number;
};

export function mapSong(row: SongRow): Song {
  return {
    id: row.id,
    provider: row.provider,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    title: row.title,
    creator: row.creator,
    duration: row.duration,
    thumbnailUrl: row.thumbnail_url,
    localAudioUri: row.local_audio_uri,
    localArtworkUri: row.local_artwork_uri,
    fileSize: row.file_size,
    dateDownloaded: row.date_downloaded,
    lastPlayed: row.last_played,
    playCount: row.play_count,
    isFavorite: row.is_favorite === 1,
  };
}

export type SongSort = 'recent' | 'title' | 'creator';

const ORDER_BY: Record<SongSort, string> = {
  recent: 'date_downloaded DESC',
  title: 'title COLLATE NOCASE ASC',
  creator: 'creator COLLATE NOCASE ASC, title COLLATE NOCASE ASC',
};

export class DuplicateSongError extends Error {
  constructor(public readonly existing: Song) {
    super('This track has already been downloaded.');
    this.name = 'DuplicateSongError';
  }
}

export function createSongsRepository(db: SqlDatabase) {
  const repo = {
    async insert(song: NewSong, now = Date.now()): Promise<Song> {
      const existing = await repo.findBySource(song.provider, song.sourceId);
      if (existing) throw new DuplicateSongError(existing);
      await db.runAsync(
        `INSERT INTO songs (id, provider, source_id, source_url, title, creator, duration,
           thumbnail_url, local_audio_uri, local_artwork_uri, file_size, date_downloaded)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          song.id,
          song.provider,
          song.sourceId,
          song.sourceUrl,
          song.title,
          song.creator,
          song.duration,
          song.thumbnailUrl,
          song.localAudioUri,
          song.localArtworkUri,
          song.fileSize,
          song.dateDownloaded ?? now,
        ],
      );
      const inserted = await repo.getById(song.id);
      if (!inserted) throw new Error('Song insert failed.');
      return inserted;
    },

    async getById(id: string): Promise<Song | null> {
      const row = await db.getFirstAsync<SongRow>('SELECT * FROM songs WHERE id = ?', [id]);
      return row ? mapSong(row) : null;
    },

    /** Fetches songs by id, preserving the order of `ids` and skipping missing ones. */
    async getByIds(ids: string[]): Promise<Song[]> {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(',');
      const rows = await db.getAllAsync<SongRow>(
        `SELECT * FROM songs WHERE id IN (${placeholders})`,
        ids,
      );
      const byId = new Map(rows.map((r) => [r.id, mapSong(r)]));
      return ids.flatMap((id) => byId.get(id) ?? []);
    },

    async getAll(sort: SongSort = 'recent'): Promise<Song[]> {
      const rows = await db.getAllAsync<SongRow>(`SELECT * FROM songs ORDER BY ${ORDER_BY[sort]}`);
      return rows.map(mapSong);
    },

    async getRecentlyDownloaded(limit = 10): Promise<Song[]> {
      const rows = await db.getAllAsync<SongRow>(
        'SELECT * FROM songs ORDER BY date_downloaded DESC LIMIT ?',
        [limit],
      );
      return rows.map(mapSong);
    },

    async getRecentlyPlayed(limit = 10): Promise<Song[]> {
      const rows = await db.getAllAsync<SongRow>(
        'SELECT * FROM songs WHERE last_played IS NOT NULL ORDER BY last_played DESC LIMIT ?',
        [limit],
      );
      return rows.map(mapSong);
    },

    async getFavorites(): Promise<Song[]> {
      const rows = await db.getAllAsync<SongRow>(
        'SELECT * FROM songs WHERE is_favorite = 1 ORDER BY title COLLATE NOCASE',
      );
      return rows.map(mapSong);
    },

    /** Duplicate detection: a source media id is unique per provider. */
    async findBySource(provider: string, sourceId: string): Promise<Song | null> {
      const row = await db.getFirstAsync<SongRow>(
        'SELECT * FROM songs WHERE provider = ? AND source_id = ?',
        [provider, sourceId],
      );
      return row ? mapSong(row) : null;
    },

    async findBySourceUrl(sourceUrl: string): Promise<Song | null> {
      const row = await db.getFirstAsync<SongRow>('SELECT * FROM songs WHERE source_url = ?', [
        sourceUrl,
      ]);
      return row ? mapSong(row) : null;
    },

    async setFavorite(id: string, isFavorite: boolean): Promise<void> {
      await db.runAsync('UPDATE songs SET is_favorite = ? WHERE id = ?', [isFavorite ? 1 : 0, id]);
    },

    /** Records a play: bumps counters and appends to playback history atomically. */
    async recordPlay(id: string, at = Date.now()): Promise<void> {
      await db.withTransactionAsync(async () => {
        const result = await db.runAsync(
          'UPDATE songs SET last_played = ?, play_count = play_count + 1 WHERE id = ?',
          [at, id],
        );
        if (result.changes === 0) return;
        await db.runAsync('INSERT INTO playback_history (song_id, played_at) VALUES (?, ?)', [
          id,
          at,
        ]);
      });
    },

    /**
     * Deletes the song row. Playlist references and history rows are removed
     * by ON DELETE CASCADE. Callers must delete the files (see deleteSong).
     */
    async delete(id: string, now = Date.now()): Promise<Song | null> {
      const song = await repo.getById(id);
      if (!song) return null;
      await db.withTransactionAsync(async () => {
        // Touch affected playlists so their updated_at reflects the removal.
        await db.runAsync(
          `UPDATE playlists SET updated_at = ?
           WHERE id IN (SELECT playlist_id FROM playlist_songs WHERE song_id = ?)`,
          [now, id],
        );
        await db.runAsync('DELETE FROM songs WHERE id = ?', [id]);
      });
      return song;
    },

    /** Offline search over title and creator (case-insensitive substring). */
    async search(query: string, limit = 50): Promise<Song[]> {
      const term = query.trim();
      if (!term) return [];
      const pattern = `%${escapeLike(term)}%`;
      const rows = await db.getAllAsync<SongRow>(
        `SELECT * FROM songs
         WHERE title LIKE ? ESCAPE '\\' OR creator LIKE ? ESCAPE '\\'
         ORDER BY (title LIKE ? ESCAPE '\\') DESC, title COLLATE NOCASE
         LIMIT ?`,
        [pattern, pattern, pattern, limit],
      );
      return rows.map(mapSong);
    },

    async totalStorageBytes(): Promise<number> {
      const row = await db.getFirstAsync<{ total: number | null }>(
        'SELECT SUM(file_size) AS total FROM songs',
      );
      return row?.total ?? 0;
    },
  };
  return repo;
}

export type SongsRepository = ReturnType<typeof createSongsRepository>;
