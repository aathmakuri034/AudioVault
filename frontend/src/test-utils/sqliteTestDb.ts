import Database from 'better-sqlite3';

import { applyPragmas, migrate } from '@/services/database/migrations';
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

  let depth = 0;
  const toArgs = (params?: SqlParams) => params ?? [];

  return {
    async execAsync(source) {
      raw.exec(source);
    },
    async runAsync(source, params) {
      const info = raw.prepare(source).run(...toArgs(params));
      return { lastInsertRowId: Number(info.lastInsertRowid), changes: info.changes };
    },
    async getFirstAsync<T>(source: string, params?: SqlParams) {
      const stmt = raw.prepare(source);
      const row = stmt.reader ? stmt.get(...toArgs(params)) : undefined;
      return (row as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, params?: SqlParams) {
      return raw.prepare(source).all(...toArgs(params)) as T[];
    },
    async withTransactionAsync(task) {
      // Nested calls join the outer transaction, as a savepoint-free shim.
      if (depth > 0) {
        depth += 1;
        try {
          await task();
        } finally {
          depth -= 1;
        }
        return;
      }
      depth = 1;
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      } finally {
        depth = 0;
      }
    },
    close() {
      raw.close();
    },
  };
}

/** A migrated test database with production pragmas applied. */
export async function createTestDb() {
  const db = createRawTestDb();
  await applyPragmas(db);
  await migrate(db);
  return db;
}
