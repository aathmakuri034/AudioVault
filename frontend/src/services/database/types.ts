/**
 * The minimal async SQLite surface the repositories depend on.
 *
 * expo-sqlite's `SQLiteDatabase` satisfies this structurally, and tests
 * provide a better-sqlite3 adapter, so repositories never import a native
 * module directly.
 */
export type SqlValue = string | number | null | Uint8Array;
export type SqlParams = SqlValue[];

export type SqlRunResult = {
  lastInsertRowId: number;
  changes: number;
};

export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SqlParams): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | null>;
  getAllAsync<T>(source: string, params?: SqlParams): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
