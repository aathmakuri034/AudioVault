import type { DownloadRecord, DownloadStatus, MediaMetadata } from '@/types/models';
import { createId } from '@/utils/id';

import type { SqlDatabase } from '../types';

type DownloadRow = {
  id: string;
  job_id: string | null;
  download_token: string | null;
  provider: string;
  source_id: string;
  source_url: string;
  metadata_json: string;
  status: DownloadStatus;
  progress: number;
  error_code: string | null;
  error_message: string | null;
  song_id: string | null;
  created_at: number;
  updated_at: number;
};

function mapDownload(row: DownloadRow): DownloadRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    downloadToken: row.download_token,
    metadata: JSON.parse(row.metadata_json) as MediaMetadata,
    status: row.status,
    progress: row.progress,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    songId: row.song_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TERMINAL: DownloadStatus[] = ['completed', 'failed'];

export type DownloadPatch = Partial<
  Pick<
    DownloadRecord,
    'jobId' | 'downloadToken' | 'status' | 'progress' | 'errorCode' | 'errorMessage' | 'songId'
  >
>;

const COLUMN: Record<keyof DownloadPatch, string> = {
  jobId: 'job_id',
  downloadToken: 'download_token',
  status: 'status',
  progress: 'progress',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  songId: 'song_id',
};

/** Persists in-flight imports so they can resume after backgrounding or a relaunch. */
export function createDownloadsRepository(db: SqlDatabase) {
  const repo = {
    async create(
      metadata: MediaMetadata,
      status: DownloadStatus = 'preparing',
      now = Date.now(),
    ): Promise<DownloadRecord> {
      const id = createId();
      await db.runAsync(
        `INSERT INTO downloads (id, provider, source_id, source_url, metadata_json, status,
           progress, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          id,
          metadata.provider,
          metadata.sourceId,
          metadata.sourceUrl,
          JSON.stringify(metadata),
          status,
          now,
          now,
        ],
      );
      const created = await repo.getById(id);
      if (!created) throw new Error('Download insert failed.');
      return created;
    },

    async getById(id: string): Promise<DownloadRecord | null> {
      const row = await db.getFirstAsync<DownloadRow>('SELECT * FROM downloads WHERE id = ?', [id]);
      return row ? mapDownload(row) : null;
    },

    async update(id: string, patch: DownloadPatch, now = Date.now()): Promise<void> {
      const keys = Object.keys(patch) as (keyof DownloadPatch)[];
      if (keys.length === 0) return;
      const sets = keys.map((k) => `${COLUMN[k]} = ?`).join(', ');
      const values = keys.map((k) => patch[k] ?? null);
      await db.runAsync(`UPDATE downloads SET ${sets}, updated_at = ? WHERE id = ?`, [
        ...values,
        now,
        id,
      ]);
    },

    /** Downloads that have not reached a terminal state, oldest first. */
    async getActive(): Promise<DownloadRecord[]> {
      const rows = await db.getAllAsync<DownloadRow>(
        `SELECT * FROM downloads WHERE status NOT IN (${TERMINAL.map(() => '?').join(',')})
         ORDER BY created_at`,
        TERMINAL,
      );
      return rows.map(mapDownload);
    },

    async getRecent(limit = 20): Promise<DownloadRecord[]> {
      const rows = await db.getAllAsync<DownloadRow>(
        'SELECT * FROM downloads ORDER BY created_at DESC LIMIT ?',
        [limit],
      );
      return rows.map(mapDownload);
    },

    async findActiveBySource(provider: string, sourceId: string): Promise<DownloadRecord | null> {
      const row = await db.getFirstAsync<DownloadRow>(
        `SELECT * FROM downloads
         WHERE provider = ? AND source_id = ? AND status NOT IN ('completed', 'failed')
         ORDER BY created_at DESC LIMIT 1`,
        [provider, sourceId],
      );
      return row ? mapDownload(row) : null;
    },

    async delete(id: string): Promise<void> {
      await db.runAsync('DELETE FROM downloads WHERE id = ?', [id]);
    },

    /** Removes finished download records older than `maxAgeMs`. */
    async pruneFinished(maxAgeMs: number, now = Date.now()): Promise<number> {
      const result = await db.runAsync(
        "DELETE FROM downloads WHERE status IN ('completed', 'failed') AND updated_at < ?",
        [now - maxAgeMs],
      );
      return result.changes;
    },
  };
  return repo;
}

export type DownloadsRepository = ReturnType<typeof createDownloadsRepository>;
