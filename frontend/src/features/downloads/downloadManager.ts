import { ApiError, type ApiClient } from '@/services/api/client';
import type { JobResponse } from '@/services/api/schemas';
import { DuplicateSongError, type Repositories } from '@/services/database/repositories';
import type { DownloadPatch } from '@/services/database/repositories/downloadsRepository';
import {
  artworkFileFor,
  audioFileFor,
  estimateMp3Bytes,
  hasSpaceFor,
} from '@/services/filesystem/musicStorage';
import type { DownloadRecord, DownloadStatus, MediaMetadata } from '@/types/models';
import { validateMediaUrl } from '@/utils/url';

import {
  canTransition,
  fractionForJob,
  isActive,
  overallProgress,
  statusForJob,
} from './downloadMachine';
import { DownloadError, messageForCode, RESUMABLE_CODES } from './errors';
import type { FileTransfer } from './fileTransfer';

/** Smallest plausible MP3; anything smaller is a truncated file. */
const MIN_MP3_BYTES = 1024;

/** Failures caused by connectivity, retried automatically on return to the app. */
const AUTO_RETRY_CODES = new Set(['network_error', 'interrupted', 'timeout']);
const AUTO_RETRY_WINDOW_MS = 60 * 60 * 1000;

/**
 * expo-file-system rejects non-2xx responses with "...HTTP <status>..." and
 * writes nothing. Map the status so e.g. a bad key isn't shown as a network
 * interruption.
 */
export function fileTransferError(error: unknown): DownloadError {
  const status = Number(/HTTP\D{0,12}(\d{3})/i.exec(String(error))?.[1]);
  if (status === 401) return new DownloadError('unauthorized');
  if (status === 403) return new DownloadError('invalid_token');
  if (status === 404 || status === 410) return new DownloadError('file_expired');
  if (status >= 500) return new DownloadError('server_error');
  return new DownloadError('interrupted');
}

export type DownloadManagerDeps = {
  api: Pick<ApiClient, 'getMetadata' | 'startDownload' | 'getJob' | 'deleteJob' | 'fileRequest'>;
  getRepositories: () => Promise<Repositories>;
  transfer: FileTransfer;
  storage?: {
    audioUriFor: (id: string) => string;
    artworkUriFor: (id: string) => string;
    hasSpaceFor: (bytes: number) => boolean;
  };
  /** Every record change, for the UI store. */
  onChange?: (record: DownloadRecord) => void;
  /** A new song landed in the library. */
  onSongAdded?: (songId: string) => void;
  pollIntervalMs?: number;
  /** Consecutive network failures tolerated while polling. */
  maxPollFailures?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

const defaultStorage = {
  audioUriFor: (id: string) => audioFileFor(id).uri,
  artworkUriFor: (id: string) => artworkFileFor(id).uri,
  hasSpaceFor,
};

const abortableSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DownloadError('cancelled'));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DownloadError('cancelled'));
    });
  });

/**
 * Orchestrates an import end to end:
 * URL → metadata → server job → poll → MP3 into private storage → SQLite.
 *
 * Each import is persisted in the `downloads` table, so it can resume after
 * the app is backgrounded or relaunched. The download id doubles as the song
 * id, so the file is always `music/{id}.mp3`. Failures never throw out of
 * `run`; they end in a `failed` record with a user-facing message.
 */
export class DownloadManager {
  private readonly running = new Map<string, AbortController>();
  private readonly storage: NonNullable<DownloadManagerDeps['storage']>;

  constructor(private readonly deps: DownloadManagerDeps) {
    this.storage = deps.storage ?? defaultStorage;
  }

  isRunning(id: string) {
    return this.running.has(id);
  }

  /**
   * Validates a pasted URL and fetches its metadata for the confirmation
   * screen. Throws DownloadError (invalid_url, duplicate, already_downloading,
   * or a mapped API error).
   */
  async prepare(input: string): Promise<MediaMetadata> {
    const validation = validateMediaUrl(input);
    if (!validation.ok) throw new DownloadError('invalid_url', validation.message);
    const metadata = await this.wrapApi(() => this.deps.api.getMetadata(validation.url));
    await this.assertNotDuplicate(metadata);
    return metadata;
  }

  /** Creates the persistent download record and starts it in the background. */
  async start(metadata: MediaMetadata): Promise<DownloadRecord> {
    await this.assertNotDuplicate(metadata);
    if (!this.storage.hasSpaceFor(estimateMp3Bytes(metadata.duration))) {
      throw new DownloadError('insufficient_storage');
    }
    const repos = await this.deps.getRepositories();
    const record = await repos.downloads.create(metadata, 'preparing');
    this.emit(record);
    void this.run(record.id);
    return record;
  }

  /** Cancels an in-flight download, or marks a stale one cancelled. */
  async cancel(id: string) {
    const controller = this.running.get(id);
    if (controller) {
      controller.abort();
      return;
    }
    const repos = await this.deps.getRepositories();
    const record = await repos.downloads.getById(id);
    if (record && isActive(record.status)) {
      await this.cleanup(record);
      await this.fail(record, new DownloadError('cancelled'));
    }
  }

  /** Retries a failed download, reusing the server job when the failure was transient. */
  async retry(id: string) {
    const repos = await this.deps.getRepositories();
    const record = await repos.downloads.getById(id);
    if (!record || record.status !== 'failed') return;
    const keepJob = record.errorCode != null && RESUMABLE_CODES.has(record.errorCode);
    await this.update(record, {
      status: 'preparing',
      progress: overallProgress('preparing'),
      errorCode: null,
      errorMessage: null,
      ...(keepJob ? {} : { jobId: null, downloadToken: null }),
    });
    void this.run(id);
  }

  /** Removes a finished record from the downloads list. */
  async dismiss(id: string) {
    if (this.running.has(id)) return;
    const repos = await this.deps.getRepositories();
    await repos.downloads.delete(id);
  }

  /**
   * Resumes every unfinished import (app start, or return to foreground), and
   * retries recent ones that failed only because the network dropped while
   * the app was suspended.
   */
  async resumeActive(now = Date.now()): Promise<string[]> {
    const repos = await this.deps.getRepositories();
    const resumed: string[] = [];
    for (const record of await repos.downloads.getActive()) {
      if (this.running.has(record.id)) continue;
      void this.run(record.id);
      resumed.push(record.id);
    }
    for (const record of await repos.downloads.getRecent(20)) {
      const recent = now - record.updatedAt < AUTO_RETRY_WINDOW_MS;
      if (
        record.status === 'failed' &&
        recent &&
        record.errorCode != null &&
        AUTO_RETRY_CODES.has(record.errorCode) &&
        !this.running.has(record.id)
      ) {
        await this.retry(record.id);
        resumed.push(record.id);
      }
    }
    return resumed;
  }

  /** Runs (or resumes) one import to completion or failure. Never throws. */
  async run(id: string): Promise<void> {
    if (this.running.has(id)) return;
    const controller = new AbortController();
    this.running.set(id, controller);
    let record: DownloadRecord | null = null;
    try {
      const repos = await this.deps.getRepositories();
      record = await repos.downloads.getById(id);
      if (!record || !isActive(record.status)) return;

      if (!record.jobId) {
        const job = await this.wrapApi(() =>
          this.deps.api.startDownload(record!.metadata.sourceUrl),
        );
        record = await this.update(record, {
          jobId: job.jobId,
          downloadToken: job.downloadToken,
          status: statusForJob(job),
          progress: overallProgress(statusForJob(job), fractionForJob(job)),
        });
      }

      const job = await this.pollUntilComplete(record, controller.signal, (r) => (record = r));
      record = await this.saveToLibrary(record, job, controller.signal);
    } catch (error) {
      if (!record) return; // e.g. the database couldn't open; resumes next launch
      const failure = controller.signal.aborted
        ? new DownloadError('cancelled')
        : this.toDownloadError(error);
      await this.cleanup(record);
      if (failure.code === 'cancelled' && record.jobId) {
        await this.deps.api.deleteJob(record.jobId).catch(() => undefined);
      }
      await this.fail(record, failure);
    } finally {
      this.running.delete(id);
    }
  }

  // ------------------------------------------------------------------ steps

  private async pollUntilComplete(
    initial: DownloadRecord,
    signal: AbortSignal,
    onUpdate: (record: DownloadRecord) => void,
  ): Promise<JobResponse> {
    let record = initial;
    let failures = 0;
    const maxFailures = this.deps.maxPollFailures ?? 5;
    const interval = this.deps.pollIntervalMs ?? 1500;
    const sleep = this.deps.sleep ?? abortableSleep;

    for (;;) {
      if (signal.aborted) throw new DownloadError('cancelled');
      let job: JobResponse;
      try {
        job = await this.deps.api.getJob(record.jobId!);
        failures = 0;
      } catch (error) {
        const transient =
          error instanceof ApiError &&
          ['network_error', 'timeout', 'server_error'].includes(error.code);
        if (!transient || ++failures > maxFailures) throw error;
        await sleep(interval * failures, signal);
        continue;
      }

      if (job.status === 'failed') {
        throw new DownloadError(
          job.error?.code ?? 'provider_error',
          messageForCode(job.error?.code ?? 'provider_error', job.error?.message),
        );
      }
      if (job.status === 'complete') return job;

      const status = statusForJob(job);
      const progress = overallProgress(status, fractionForJob(job));
      if (status !== record.status || progress !== record.progress) {
        record = await this.update(record, { status, progress });
        onUpdate(record);
      }
      await sleep(interval, signal);
    }
  }

  private async saveToLibrary(
    initial: DownloadRecord,
    job: JobResponse,
    signal: AbortSignal,
  ): Promise<DownloadRecord> {
    let record = await this.update(initial, {
      status: 'saving',
      progress: overallProgress('saving'),
    });
    const { metadata } = record;

    if (job.fileSize != null && !this.storage.hasSpaceFor(job.fileSize)) {
      throw new DownloadError('insufficient_storage');
    }

    const audioUri = this.storage.audioUriFor(record.id);
    const request = await this.deps.api.fileRequest(job.jobId, record.downloadToken ?? '');
    let lastShown = record.progress;
    const result = await this.deps.transfer
      .download(request.url, audioUri, {
        headers: request.headers,
        signal,
        onProgress: ({ bytesWritten, totalBytes }) => {
          const total = totalBytes > 0 ? totalBytes : (job.fileSize ?? 0);
          if (total <= 0) return;
          // Leave the last few percent for writing the library entry.
          const progress = overallProgress('saving', (bytesWritten / total) * 0.9);
          if (progress - lastShown >= 2) {
            lastShown = progress;
            this.emit({ ...record, progress });
          }
        },
      })
      .catch((error: unknown) => {
        if (signal.aborted) throw new DownloadError('cancelled');
        throw error instanceof DownloadError ? error : fileTransferError(error);
      });

    // A size mismatch means a truncated transfer or an error page saved as a file.
    const sizeOk =
      result.size >= MIN_MP3_BYTES && (job.fileSize == null || result.size === job.fileSize);
    if (!sizeOk) throw new DownloadError('corrupted_file');

    let artworkUri: string | null = null;
    if (metadata.thumbnail) {
      try {
        artworkUri = (
          await this.deps.transfer.downloadSmall(
            metadata.thumbnail,
            this.storage.artworkUriFor(record.id),
          )
        ).uri;
      } catch {
        artworkUri = null; // artwork is optional; a placeholder is shown instead
      }
    }

    // A cancel during artwork download must still stop the import.
    if (signal.aborted) throw new DownloadError('cancelled');
    const repos = await this.deps.getRepositories();
    try {
      await repos.songs.insert({
        id: record.id,
        provider: metadata.provider,
        sourceId: metadata.sourceId,
        sourceUrl: metadata.sourceUrl,
        title: metadata.title,
        creator: metadata.creator,
        duration: metadata.duration,
        thumbnailUrl: metadata.thumbnail,
        localAudioUri: result.uri,
        localArtworkUri: artworkUri,
        fileSize: result.size,
      });
    } catch (error) {
      if (error instanceof DuplicateSongError) {
        throw new DownloadError('duplicate', undefined, error.existing.id);
      }
      throw error;
    }

    record = await this.update(record, { status: 'completed', progress: 100, songId: record.id });
    this.deps.onSongAdded?.(record.id);
    // Tell the server it can delete its temporary copy now.
    await this.deps.api.deleteJob(job.jobId).catch(() => undefined);
    return record;
  }

  // -------------------------------------------------------------- helpers

  private async assertNotDuplicate(metadata: MediaMetadata) {
    const repos = await this.deps.getRepositories();
    const existing = await repos.songs.findBySource(metadata.provider, metadata.sourceId);
    if (existing) throw new DownloadError('duplicate', undefined, existing.id);
    const inFlight = await repos.downloads.findActiveBySource(metadata.provider, metadata.sourceId);
    if (inFlight) throw new DownloadError('already_downloading', undefined, inFlight.id);
  }

  private async update(record: DownloadRecord, patch: DownloadPatch): Promise<DownloadRecord> {
    const next = patch.status ?? record.status;
    if (!canTransition(record.status, next)) {
      throw new Error(`Invalid download transition ${record.status} → ${next}`);
    }
    const repos = await this.deps.getRepositories();
    await repos.downloads.update(record.id, patch);
    const updated = (await repos.downloads.getById(record.id)) ?? { ...record, ...patch };
    this.emit(updated as DownloadRecord);
    return updated as DownloadRecord;
  }

  private async fail(record: DownloadRecord, error: DownloadError) {
    const repos = await this.deps.getRepositories();
    await repos.downloads.update(record.id, {
      status: 'failed' satisfies DownloadStatus,
      errorCode: error.code,
      errorMessage: error.message,
    });
    const updated = await repos.downloads.getById(record.id);
    if (updated) this.emit(updated);
  }

  private async cleanup(record: DownloadRecord) {
    for (const uri of [
      this.storage.audioUriFor(record.id),
      this.storage.artworkUriFor(record.id),
    ]) {
      try {
        this.deps.transfer.delete(uri);
      } catch {
        // Orphans are pruned on next launch.
      }
    }
  }

  private emit(record: DownloadRecord) {
    this.deps.onChange?.(record);
  }

  private async wrapApi<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      throw this.toDownloadError(error);
    }
  }

  private toDownloadError(error: unknown): DownloadError {
    if (error instanceof DownloadError) return error;
    if (error instanceof ApiError) {
      // Keep the server's message for limits like "longer than 30 minutes".
      const keepServerMessage = ['media_too_long', 'rate_limited'].includes(error.code);
      return new DownloadError(
        error.code,
        keepServerMessage ? error.message : messageForCode(error.code, error.message),
      );
    }
    return new DownloadError('interrupted');
  }
}
