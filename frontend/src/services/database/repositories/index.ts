import { getDatabase } from '../client';
import type { SqlDatabase } from '../types';
import { createDownloadsRepository } from './downloadsRepository';
import { createPlaylistsRepository } from './playlistsRepository';
import { createSettingsRepository } from './settingsRepository';
import { createSongsRepository } from './songsRepository';

export type Repositories = {
  songs: ReturnType<typeof createSongsRepository>;
  playlists: ReturnType<typeof createPlaylistsRepository>;
  downloads: ReturnType<typeof createDownloadsRepository>;
  settings: ReturnType<typeof createSettingsRepository>;
};

export function createRepositories(db: SqlDatabase): Repositories {
  return {
    songs: createSongsRepository(db),
    playlists: createPlaylistsRepository(db),
    downloads: createDownloadsRepository(db),
    settings: createSettingsRepository(db),
  };
}

let repositories: Promise<Repositories> | null = null;

/** App-wide repositories bound to the on-device database. */
export function getRepositories(): Promise<Repositories> {
  repositories ??= getDatabase().then(createRepositories);
  return repositories;
}

export { DuplicateSongError } from './songsRepository';
export type { SongSort } from './songsRepository';
export { SettingKeys } from './settingsRepository';
