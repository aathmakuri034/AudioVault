import type { ZodType } from 'zod';

import type { SqlDatabase } from '../types';

/**
 * JSON key/value settings. Values are validated with a zod schema on read so
 * a corrupted or outdated value falls back to `null` instead of crashing.
 * Secrets (the API key) do NOT live here; they go in the secure keychain.
 */
export function createSettingsRepository(db: SqlDatabase) {
  return {
    async get<T>(key: string, schema: ZodType<T>): Promise<T | null> {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?',
        [key],
      );
      if (!row) return null;
      try {
        const parsed = schema.safeParse(JSON.parse(row.value));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },

    async set(key: string, value: unknown): Promise<void> {
      await db.runAsync(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [key, JSON.stringify(value)],
      );
    },

    async remove(key: string): Promise<void> {
      await db.runAsync('DELETE FROM app_settings WHERE key = ?', [key]);
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;

/** Known setting keys. */
export const SettingKeys = {
  consentAcknowledgedAt: 'consent.acknowledgedAt',
  playerState: 'player.state',
  apiBaseUrl: 'api.baseUrl',
  librarySort: 'library.sort',
} as const;
