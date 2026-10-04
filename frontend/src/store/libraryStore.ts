import { create } from 'zustand';
import { z } from 'zod';

import { createLibraryService } from '@/features/library/libraryService';
import { getRepositories, SettingKeys, type SongSort } from '@/services/database/repositories';
import type { Playlist, Song } from '@/types/models';

type LibraryState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  songs: Song[];
  playlists: Playlist[];
  favorites: Song[];
  recentlyPlayed: Song[];
  recentlyDownloaded: Song[];
  sort: SongSort;

  /** Re-reads everything from SQLite. Cheap enough for libraries of thousands of rows. */
  refresh: () => Promise<void>;
  setSort: (sort: SongSort) => Promise<void>;
  toggleFavorite: (songId: string) => Promise<void>;
  deleteSong: (songId: string) => Promise<void>;
};

const sortSchema = z.enum(['recent', 'title', 'creator']);

/**
 * Read model of the local library for the UI. SQLite is the source of truth;
 * mutations go through repositories/services and then refresh this snapshot.
 */
export const useLibraryStore = create<LibraryState>((set, get) => ({
  status: 'idle',
  error: null,
  songs: [],
  playlists: [],
  favorites: [],
  recentlyPlayed: [],
  recentlyDownloaded: [],
  sort: 'recent',

  async refresh() {
    if (get().status === 'idle') set({ status: 'loading' });
    try {
      const repos = await getRepositories();
      const storedSort =
        (await repos.settings.get(SettingKeys.librarySort, sortSchema)) ?? get().sort;
      const [songs, playlists, favorites, recentlyPlayed, recentlyDownloaded] = await Promise.all([
        repos.songs.getAll(storedSort),
        repos.playlists.getAll(),
        repos.songs.getFavorites(),
        repos.songs.getRecentlyPlayed(10),
        repos.songs.getRecentlyDownloaded(10),
      ]);
      set({
        status: 'ready',
        error: null,
        sort: storedSort,
        songs,
        playlists,
        favorites,
        recentlyPlayed,
        recentlyDownloaded,
      });
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  },

  async setSort(sort) {
    const repos = await getRepositories();
    await repos.settings.set(SettingKeys.librarySort, sort);
    set({ sort });
    await get().refresh();
  },

  async toggleFavorite(songId) {
    const song = get().songs.find((s) => s.id === songId);
    if (!song) return;
    const repos = await getRepositories();
    await repos.songs.setFavorite(songId, !song.isFavorite);
    await get().refresh();
  },

  async deleteSong(songId) {
    const repos = await getRepositories();
    await createLibraryService(repos).deleteSong(songId);
    await get().refresh();
  },
}));
