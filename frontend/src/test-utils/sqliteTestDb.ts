import Database from 'better-sqlite3';

import { applyPragmas, migrate } from '@/services/database/migrations';
import { createSerializedDatabase } from '@/services/database/serialized';
import type { SqlDatabase, SqlParams } from '@/services/database/types';

/**
 * In-memory SQLite for tests, adapted to the same async interface
 * expo-sqlite exposes. This runs the real schema, constraints and cascades.
 */
export function createRawTestDb(): SqlDatabase & { close(): void } {
  const raw = new Database(':memory:');
  // better-sqlite3 enables foreign keys by default; turn them off so tests
  // prove that applyPragmas() is what enables them, as on device.
  raw.pragma('foreign_keys = OFF');
  const args = (params?: SqlParams) => params ?? [];

  // Same serialization as the device database, so a repository that uses the
  // outer handle inside a transaction deadlocks here too (and fails the test).
  const db = createSerializedDatabase({
    async execAsync(source) {
      raw.exec(source);
    },
    async runAsync(source, params) {
      const info = raw.prepare(source).run(...args(params));
      return { lastInsertRowId: Number(info.lastInsertRowid), changes: info.changes };
    },
    async getFirstAsync<T>(source: string, params?: SqlParams) {
      const stmt = raw.prepare(source);
      const row = stmt.reader ? stmt.get(...args(params)) : undefined;
      return (row as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, params?: SqlParams) {
      return raw.prepare(source).all(...args(params)) as T[];
    },
  });
  return { ...db, close: () => raw.close() };
}

/** A migrated test database with production pragmas applied. */
export async function createTestDb() {
  const db = createRawTestDb();
  await applyPragmas(db);
  await migrate(db);
  return db;
}
