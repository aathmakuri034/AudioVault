import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { applyPragmas, migrate } from './migrations';
import { createSerializedDatabase } from './serialized';
import type { SqlDatabase } from './types';

const DATABASE_NAME = 'audiovault.db';

let dbPromise: Promise<SqlDatabase> | null = null;

/** Narrows expo-sqlite's overloaded API and serializes access (see serialized.ts). */
function adapt(db: SQLiteDatabase): SqlDatabase {
  return createSerializedDatabase({
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, params = []) => db.runAsync(source, params),
    getFirstAsync: (source, params = []) => db.getFirstAsync(source, params),
    getAllAsync: (source, params = []) => db.getAllAsync(source, params),
  });
}

async function open(): Promise<SqlDatabase> {
  const native = await openDatabaseAsync(DATABASE_NAME);
  await native.execAsync('PRAGMA journal_mode = WAL;');
  const db = adapt(native);
  await applyPragmas(db);
  await migrate(db);
  return db;
}

/**
 * Returns the app's single database connection, opening and migrating it
 * on first use. The database lives in the app's private sandbox.
 */
export function getDatabase(): Promise<SqlDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((error: unknown) => {
      dbPromise = null; // allow a retry after a failed open
      throw error;
    });
  }
  return dbPromise;
}
