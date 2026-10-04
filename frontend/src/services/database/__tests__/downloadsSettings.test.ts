import { z } from 'zod';

import { makeSong } from '@/test-utils/fixtures';
import { createTestDb } from '@/test-utils/sqliteTestDb';
import type { MediaMetadata } from '@/types/models';

import { createDownloadsRepository } from '../repositories/downloadsRepository';
import { createSettingsRepository } from '../repositories/settingsRepository';
import { createSongsRepository } from '../repositories/songsRepository';

const meta: MediaMetadata = {
  provider: 'youtube',
  sourceId: 'abcdefghijk',
  sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  title: 'Track',
  creator: 'Artist',
  thumbnail: null,
  duration: 200,
};

describe('downloadsRepository', () => {
  it('persists an import and tracks it as active until terminal', async () => {
    const db = await createTestDb();
    const downloads = createDownloadsRepository(db);
    const d = await downloads.create(meta, 'preparing', 1);
    expect(d).toMatchObject({ status: 'preparing', progress: 0, metadata: meta, jobId: null });

    await downloads.update(
      d.id,
      { jobId: 'job-1', downloadToken: 'tok', status: 'processing', progress: 40 },
      2,
    );
    expect(await downloads.getById(d.id)).toMatchObject({
      jobId: 'job-1',
      downloadToken: 'tok',
      status: 'processing',
      progress: 40,
      updatedAt: 2,
    });
    expect((await downloads.getActive()).map((x) => x.id)).toEqual([d.id]);
    expect(await downloads.findActiveBySource('youtube', meta.sourceId)).not.toBeNull();

    await downloads.update(d.id, { status: 'failed', errorCode: 'network', errorMessage: 'x' });
    expect(await downloads.getActive()).toEqual([]);
    expect(await downloads.findActiveBySource('youtube', meta.sourceId)).toBeNull();
  });

  it('nulls the song link when the song is deleted', async () => {
    const db = await createTestDb();
    const downloads = createDownloadsRepository(db);
    const songs = createSongsRepository(db);
    const song = await songs.insert(makeSong());
    const d = await downloads.create(meta);
    await downloads.update(d.id, { songId: song.id, status: 'completed' });
    await songs.delete(song.id);
    expect((await downloads.getById(d.id))?.songId).toBeNull();
  });

  it('rejects unknown statuses at the schema level', async () => {
    const db = await createTestDb();
    const downloads = createDownloadsRepository(db);
    const d = await downloads.create(meta);
    // @ts-expect-error invalid on purpose
    await expect(downloads.update(d.id, { status: 'bogus' })).rejects.toThrow();
  });

  it('prunes old finished records only', async () => {
    const db = await createTestDb();
    const downloads = createDownloadsRepository(db);
    const old = await downloads.create(meta, 'preparing', 0);
    await downloads.update(old.id, { status: 'completed' }, 0);
    const active = await downloads.create(meta, 'processing', 0);
    expect(await downloads.pruneFinished(1000, 5000)).toBe(1);
    expect(await downloads.getById(old.id)).toBeNull();
    expect(await downloads.getById(active.id)).not.toBeNull();
  });
});

describe('settingsRepository', () => {
  it('round-trips validated JSON values', async () => {
    const db = await createTestDb();
    const settings = createSettingsRepository(db);
    const schema = z.object({ index: z.number() });
    expect(await settings.get('k', schema)).toBeNull();
    await settings.set('k', { index: 2 });
    await settings.set('k', { index: 3 });
    expect(await settings.get('k', schema)).toEqual({ index: 3 });
    await settings.remove('k');
    expect(await settings.get('k', schema)).toBeNull();
  });

  it('returns null for corrupted or outdated values instead of throwing', async () => {
    const db = await createTestDb();
    const settings = createSettingsRepository(db);
    await db.runAsync("INSERT INTO app_settings (key, value) VALUES ('bad', '{not json')");
    await settings.set('old', { index: 'nope' });
    const schema = z.object({ index: z.number() });
    expect(await settings.get('bad', schema)).toBeNull();
    expect(await settings.get('old', schema)).toBeNull();
  });
});
