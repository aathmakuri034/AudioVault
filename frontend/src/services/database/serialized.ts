import type { SqlDatabase } from './types';

/** A raw connection: plain statements, no transaction management. */
export type RawDatabase = Omit<SqlDatabase, 'withTransactionAsync'>;

/**
 * Serializes every operation on a single SQLite connection.
 *
 * expo-sqlite's `withTransactionAsync` is a bare BEGIN/COMMIT on the shared
 * connection, so two overlapping transactions (e.g. recording a play while
 * a playlist is reordered) would roll each other back, and unrelated writes
 * could land inside someone else's transaction. Here every call is queued
 * in order, and a transaction runs as one queued unit whose statements use
 * the `tx` handle it is given. (`withExclusiveTransactionAsync` was not used
 * because it opens a second connection without our foreign-key pragma.)
 *
 * Inside a transaction, always use `tx`, never the outer database: the
 * outer handle waits for the queue and would deadlock.
 */
export function createSerializedDatabase(raw: RawDatabase): SqlDatabase {
  let tail: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(op: () => Promise<T>): Promise<T> => {
    // Run after the previous operation whether it succeeded or failed.
    const run = tail.then(op, op);
    tail = run.catch(() => undefined);
    return run;
  };

  const tx: SqlDatabase = {
    execAsync: (source) => raw.execAsync(source),
    runAsync: (source, params) => raw.runAsync(source, params),
    getFirstAsync: (source, params) => raw.getFirstAsync(source, params),
    getAllAsync: (source, params) => raw.getAllAsync(source, params),
    // Nested transactions join the enclosing one.
    withTransactionAsync: (task) => task(tx),
  };

  return {
    execAsync: (source) => enqueue(() => raw.execAsync(source)),
    runAsync: (source, params) => enqueue(() => raw.runAsync(source, params)),
    getFirstAsync: (source, params) => enqueue(() => raw.getFirstAsync(source, params)),
    getAllAsync: (source, params) => enqueue(() => raw.getAllAsync(source, params)),
    withTransactionAsync: (task) =>
      enqueue(async () => {
        await raw.execAsync('BEGIN');
        try {
          await task(tx);
          await raw.execAsync('COMMIT');
        } catch (error) {
          await raw.execAsync('ROLLBACK');
          throw error;
        }
      }),
  };
}
