import type { JobResponse } from '@/services/api/schemas';
import type { DownloadStatus } from '@/types/models';

/**
 * The import lifecycle shown to the user:
 *
 *   validating → preparing → downloading → processing → saving → completed
 *        └──────────┴────────────┴─────────────┴───────────┴──→ failed → preparing (retry)
 *
 * - validating:  URL check + metadata lookup
 * - preparing:   job accepted, waiting in the server queue
 * - downloading: server fetching the source audio
 * - processing:  server converting to MP3 (FFmpeg)
 * - saving:      transferring the MP3 into private storage + writing SQLite
 */
const TRANSITIONS: Record<DownloadStatus, DownloadStatus[]> = {
  validating: ['preparing', 'failed'],
  preparing: ['downloading', 'processing', 'saving', 'failed'],
  downloading: ['processing', 'saving', 'failed'],
  processing: ['saving', 'failed'],
  saving: ['completed', 'failed'],
  completed: [],
  failed: ['preparing'],
};

export function canTransition(from: DownloadStatus, to: DownloadStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export const TERMINAL_STATUSES: readonly DownloadStatus[] = ['completed', 'failed'];

export function isActive(status: DownloadStatus): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

/** Maps a server job to the UI status. A completed job means the device transfer is next. */
export function statusForJob(job: Pick<JobResponse, 'status' | 'stage'>): DownloadStatus {
  switch (job.status) {
    case 'queued':
      return 'preparing';
    case 'processing':
      return job.stage === 'converting' ? 'processing' : 'downloading';
    case 'complete':
      return 'saving';
    case 'failed':
      return 'failed';
  }
}

/** Overall progress band (0–100) owned by each status. */
const BANDS: Record<DownloadStatus, [number, number]> = {
  validating: [0, 5],
  preparing: [5, 10],
  downloading: [10, 60],
  processing: [60, 80],
  saving: [80, 100],
  completed: [100, 100],
  failed: [0, 0],
};

/** Server progress at which the source download ends and conversion begins. */
const SERVER_DOWNLOAD_SHARE = 85;

/**
 * Overall 0–100 progress. `fraction` is progress within the current status
 * (0–1); for server stages pass the server's 0–100 progress via
 * {@link fractionForJob}.
 */
export function overallProgress(status: DownloadStatus, fraction = 0): number {
  const [start, end] = BANDS[status];
  const f = Math.min(Math.max(fraction, 0), 1);
  return Math.round(start + (end - start) * f);
}

export function fractionForJob(job: Pick<JobResponse, 'status' | 'stage' | 'progress'>): number {
  const status = statusForJob(job);
  if (status === 'downloading') return job.progress / SERVER_DOWNLOAD_SHARE;
  if (status === 'processing') {
    return (job.progress - SERVER_DOWNLOAD_SHARE) / (100 - SERVER_DOWNLOAD_SHARE);
  }
  return 0;
}

export const STATUS_LABEL: Record<DownloadStatus, string> = {
  validating: 'Checking link…',
  preparing: 'Preparing…',
  downloading: 'Downloading audio…',
  processing: 'Converting to MP3…',
  saving: 'Saving to your library…',
  completed: 'Downloaded',
  failed: 'Failed',
};
