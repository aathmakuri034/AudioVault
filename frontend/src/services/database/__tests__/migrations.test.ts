import { createRawTestDb, createTestDb } from '@/test-utils/sqliteTestDb';

import { SCHEMA_VERSION, applyPragmas, migrate } from '../migrations';

describe('migrations', () => {
  it('creates every table and records the schema version', async () => {
    const db = await createTestDb();
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual([
      'app_settings',
      'downloads',
      'playback_history',
      'playlist_songs',
      'playlists',
      'songs',
    ]);
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(SCHEMA_VERSION);
  });

  it('is idempotent across launches', async () => {
    const db = await createTestDb();
    await expect(migrate(db)).resolves.toBeUndefined();
  });

  it('enables foreign keys only through applyPragmas', async () => {
    const db = createRawTestDb();
    const before = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(before?.foreign_keys).toBe(0);
    await applyPragmas(db);
    const after = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(after?.foreign_keys).toBe(1);
  });

  it('refuses to run against a newer schema', async () => {
    const db = await createTestDb();
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    await expect(migrate(db)).rejects.toThrow(/newer than this app/);
  });
});
