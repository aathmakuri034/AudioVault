import { ApiError } from '@/services/api/client';
import type { JobResponse, MetadataResponse } from '@/services/api/schemas';
import { createRepositories, type Repositories } from '@/services/database/repositories';
import { flush } from '@/test-utils/fakeAudioEngine';
import { makeSong } from '@/test-utils/fixtures';
import { createTestDb } from '@/test-utils/sqliteTestDb';
import type { DownloadRecord, DownloadStatus } from '@/types/models';

import { DownloadManager } from '../downloadManager';
import { DownloadError } from '../errors';
import type { FileTransfer } from '../fileTransfer';

jest.mock('expo-file-system', () => require('@/test-utils/fakeFileSystem').fakeExpoFileSystem);
jest.mock('expo-sqlite', () => ({}));

const JOB_ID = '9f60bf07-0c21-4ca3-8513-2d00e35e62fc';
const FILE_SIZE = 4_000_000;

const metadata: MetadataResponse = {
  provider: 'youtube',
  sourceId: 'aqz-KE-bpKQ',
  sourceUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  title: 'Big Buck Bunny',
  creator: 'Blender',
  thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hq.jpg',
  duration: 635,
};

function job(partial: Partial<JobResponse>): JobResponse {
  return {
    jobId: JOB_ID,
    status: 'processing',
    stage: 'downloading',
    progress: 0,
    error: null,
    fileSize: null,
    expiresAt: null,
    ...partial,
  };
}

/** Server job progression returned by successive getJob calls. */
const HAPPY_JOBS = [
  job({ status: 'queued', stage: 'queued' }),
  job({ stage: 'downloading', progress: 40 }),
  job({ stage: 'converting', progress: 90 }),
  job({ status: 'complete', stage: 'ready', progress: 100, fileSize: FILE_SIZE }),
];

class FakeApi {
  jobs: (JobResponse | Error)[] = [...HAPPY_JOBS];
  deleted: string[] = [];
  metadataResult: MetadataResponse | Error = metadata;
  startResult: Error | null = null;

  getMetadata = jest.fn(async () => {
    if (this.metadataResult instanceof Error) throw this.metadataResult;
    return this.metadataResult;
  });
  startDownload = jest.fn(async () => {
    if (this.startResult) throw this.startResult;
    return {
      jobId: JOB_ID,
      status: 'queued' as const,
      stage: 'queued' as const,
      progress: 0,
      downloadToken: 't'.repeat(43),
      metadata,
    };
  });
  getJob = jest.fn(async () => {
    const next = this.jobs.length > 1 ? this.jobs.shift()! : this.jobs[0];
    if (next instanceof Error) throw next;
    return next;
  });
  deleteJob = jest.fn(async (id: string) => {
    this.deleted.push(id);
  });
  fileRequest = jest.fn(async (id: string, token: string) => ({
    url: `http://server/api/media/jobs/${id}/file?token=${token}`,
    headers: { 'X-API-Key': 'k' },
  }));
}

class FakeTransfer implements FileTransfer {
  files = new Map<string, number>();
  size = FILE_SIZE;
  fail: Error | null = null;
  artworkFails = false;
  /** Resolves the in-flight transfer when the test calls it. */
  gate: Promise<void> | null = null;

  async download(
    _url: string,
    destUri: string,
    options: {
      onProgress?: (p: { bytesWritten: number; totalBytes: number }) => void;
      signal?: AbortSignal;
    },
  ) {
    options.onProgress?.({ bytesWritten: this.size / 2, totalBytes: this.size });
    if (this.gate) await this.gate;
    if (options.signal?.aborted) throw new Error('aborted');
    if (this.fail) throw this.fail;
    this.files.set(destUri, this.size);
    return { uri: destUri, size: this.size };
  }
  async downloadSmall(_url: string, destUri: string) {
    if (this.artworkFails) throw new Error('404');
    this.files.set(destUri, 10);
    return { uri: destUri };
  }
  delete(uri: string) {
    this.files.delete(uri);
  }
}

type Harness = {
  manager: DownloadManager;
  api: FakeApi;
  transfer: FakeTransfer;
  repos: Repositories;
  statuses: DownloadStatus[];
  added: string[];
  space: { ok: boolean };
};

async function setup(): Promise<Harness> {
  const repos = createRepositories(await createTestDb());
  const api = new FakeApi();
  const transfer = new FakeTransfer();
  const statuses: DownloadStatus[] = [];
  const added: string[] = [];
  const space = { ok: true };
  const manager = new DownloadManager({
    api,
    getRepositories: async () => repos,
    transfer,
    storage: {
      audioUriFor: (id) => `file:///music/${id}.mp3`,
      artworkUriFor: (id) => `file:///music/${id}.jpg`,
      hasSpaceFor: () => space.ok,
    },
    onChange: (r: DownloadRecord) => {
      if (statuses.at(-1) !== r.status) statuses.push(r.status);
    },
    onSongAdded: (id) => added.push(id),
    sleep: async () => undefined,
    maxPollFailures: 2,
  });
  return { manager, api, transfer, repos, statuses, added, space };
}

/** Waits until the background run settles. */
async function settle(h: Harness, id: string) {
  for (let i = 0; i < 50 && h.manager.isRunning(id); i += 1) await flush();
  return h.repos.downloads.getById(id);
}

describe('DownloadManager.prepare', () => {
  it('validates the URL before calling the server', async () => {
    const h = await setup();
    await expect(h.manager.prepare('not a link')).rejects.toMatchObject({ code: 'invalid_url' });
    expect(h.api.getMetadata).not.toHaveBeenCalled();
  });

  it('returns metadata for the confirmation screen', async () => {
    const h = await setup();
    await expect(h.manager.prepare(' https://youtu.be/aqz-KE-bpKQ ')).resolves.toEqual(metadata);
    expect(h.api.getMetadata).toHaveBeenCalledWith('https://youtu.be/aqz-KE-bpKQ');
  });

  it('detects tracks that are already downloaded', async () => {
    const h = await setup();
    await h.repos.songs.insert(makeSong({ provider: 'youtube', sourceId: metadata.sourceId }));
    await expect(h.manager.prepare(metadata.sourceUrl)).rejects.toMatchObject({
      code: 'duplicate',
      message: 'This track has already been downloaded.',
    });
  });

  it('maps backend errors to friendly messages', async () => {
    const h = await setup();
    h.api.metadataResult = new ApiError('private_media', 'This media is private.', 403);
    await expect(h.manager.prepare(metadata.sourceUrl)).rejects.toMatchObject({
      code: 'private_media',
      message: expect.stringMatching(/private/),
    });
    h.api.metadataResult = new ApiError('network_error', 'x');
    await expect(h.manager.prepare(metadata.sourceUrl)).rejects.toMatchObject({
      code: 'network_error',
    });
  });
});

describe('DownloadManager happy path', () => {
  it('walks every status and saves the MP3 + metadata locally', async () => {
    const h = await setup();
    const record = await h.manager.start(metadata);
    const done = await settle(h, record.id);

    expect(h.statuses).toEqual(['preparing', 'downloading', 'processing', 'saving', 'completed']);
    expect(done).toMatchObject({ status: 'completed', progress: 100, songId: record.id });

    const song = await h.repos.songs.getById(record.id);
    expect(song).toMatchObject({
      title: 'Big Buck Bunny',
      creator: 'Blender',
      duration: 635,
      sourceId: metadata.sourceId,
      localAudioUri: `file:///music/${record.id}.mp3`,
      localArtworkUri: `file:///music/${record.id}.jpg`,
      fileSize: FILE_SIZE,
    });
    expect(h.added).toEqual([record.id]);
    // Server copy deleted only after the device has the file.
    expect(h.api.deleted).toEqual([JOB_ID]);
  });

  it('still succeeds without artwork', async () => {
    const h = await setup();
    h.transfer.artworkFails = true;
    const record = await h.manager.start(metadata);
    await settle(h, record.id);
    expect((await h.repos.songs.getById(record.id))?.localArtworkUri).toBeNull();
  });

  it('rejects starting a duplicate while one is in flight', async () => {
    const h = await setup();
    let release!: () => void;
    h.transfer.gate = new Promise((r) => (release = r));
    const first = await h.manager.start(metadata);
    await expect(h.manager.start(metadata)).rejects.toMatchObject({ code: 'already_downloading' });
    release();
    await settle(h, first.id);
  });
});

describe('DownloadManager failures', () => {
  it('refuses to start without enough storage', async () => {
    const h = await setup();
    h.space.ok = false;
    await expect(h.manager.start(metadata)).rejects.toMatchObject({
      code: 'insufficient_storage',
      message: 'Not enough storage is available on your device.',
    });
  });

  it('records server-side failures (e.g. conversion) without crashing', async () => {
    const h = await setup();
    h.api.jobs = [
      job({
        status: 'failed',
        stage: 'failed',
        error: { code: 'conversion_failed', message: 'x' },
      }),
    ];
    const record = await h.manager.start(metadata);
    const done = await settle(h, record.id);
    expect(done).toMatchObject({ status: 'failed', errorCode: 'conversion_failed' });
    expect(await h.repos.songs.getById(record.id)).toBeNull();
  });

  it('tolerates brief network drops while polling, then fails as interrupted', async () => {
    const h = await setup();
    const drop = new ApiError('network_error', 'offline');
    h.api.jobs = [drop, ...HAPPY_JOBS];
    const ok = await h.manager.start(metadata);
    expect((await settle(h, ok.id))?.status).toBe('completed');

    const h2 = await setup();
    h2.api.jobs = [drop];
    const bad = await h2.manager.start(metadata);
    expect(await settle(h2, bad.id)).toMatchObject({
      status: 'failed',
      errorCode: 'network_error',
      errorMessage: 'Your download was interrupted. Try again.',
    });
  });

  it('detects corrupted or truncated files and cleans them up', async () => {
    const h = await setup();
    h.transfer.size = 512;
    const record = await h.manager.start(metadata);
    const done = await settle(h, record.id);
    expect(done).toMatchObject({ status: 'failed', errorCode: 'corrupted_file' });
    expect(h.transfer.files.size).toBe(0);
    expect(await h.repos.songs.getById(record.id)).toBeNull();
  });

  it('handles an interrupted file transfer', async () => {
    const h = await setup();
    h.transfer.fail = new Error('socket closed');
    const record = await h.manager.start(metadata);
    expect(await settle(h, record.id)).toMatchObject({
      status: 'failed',
      errorCode: 'interrupted',
    });
  });

  it('cancels on user request, deletes partial files and the server job', async () => {
    const h = await setup();
    let release!: () => void;
    h.transfer.gate = new Promise((r) => (release = r));
    const record = await h.manager.start(metadata);
    for (let i = 0; i < 20 && h.statuses.at(-1) !== 'saving'; i += 1) await flush();
    await h.manager.cancel(record.id);
    release();
    const done = await settle(h, record.id);
    expect(done).toMatchObject({
      status: 'failed',
      errorCode: 'cancelled',
      errorMessage: 'Download cancelled.',
    });
    expect(h.api.deleted).toEqual([JOB_ID]);
    expect(h.transfer.files.size).toBe(0);
  });
});

describe('DownloadManager resume and retry', () => {
  it('resumes an unfinished import after relaunch using its saved job', async () => {
    const h = await setup();
    const record = await h.repos.downloads.create(metadata, 'preparing');
    await h.repos.downloads.update(record.id, {
      jobId: JOB_ID,
      downloadToken: 't'.repeat(43),
      status: 'processing',
    });
    h.api.jobs = [HAPPY_JOBS[3]];

    expect(await h.manager.resumeActive()).toEqual([record.id]);
    expect(await settle(h, record.id)).toMatchObject({ status: 'completed' });
    expect(h.api.startDownload).not.toHaveBeenCalled();
  });

  it('retries transient failures against the same server job', async () => {
    const h = await setup();
    h.transfer.fail = new Error('socket closed');
    const record = await h.manager.start(metadata);
    await settle(h, record.id);
    h.transfer.fail = null;
    h.api.jobs = [HAPPY_JOBS[3]];
    await h.manager.retry(record.id);
    expect(await settle(h, record.id)).toMatchObject({ status: 'completed' });
    expect(h.api.startDownload).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh server job when retrying a permanent failure', async () => {
    const h = await setup();
    h.api.startResult = new ApiError('server_busy', 'busy', 503);
    const record = await h.manager.start(metadata);
    expect((await settle(h, record.id))?.errorCode).toBe('server_busy');
    h.api.startResult = null;
    await h.manager.retry(record.id);
    expect((await settle(h, record.id))?.status).toBe('completed');
    expect(h.api.startDownload).toHaveBeenCalledTimes(2);
  });

  it('exposes DownloadError for UI handling', () => {
    expect(new DownloadError('duplicate').message).toBe('This track has already been downloaded.');
  });
});
