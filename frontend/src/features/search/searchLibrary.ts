import type { Repositories } from '@/services/database/repositories';
import type { Playlist, Song } from '@/types/models';

export const SONG_LIMIT = 50;
export const PLAYLIST_LIMIT = 20;

export type SearchResults = { songs: Song[]; playlists: Playlist[] };

/**
 * Offline search over downloaded songs (title, creator) and playlists (name).
 * Local database only: never touches the network.
 */
export async function searchLibrary(
  repos: Pick<Repositories, 'songs' | 'playlists'>,
  query: string,
): Promise<SearchResults> {
  const term = query.trim();
  if (!term) return { songs: [], playlists: [] };
  const [songs, playlists] = await Promise.all([
    repos.songs.search(term, SONG_LIMIT),
    repos.playlists.search(term, PLAYLIST_LIMIT),
  ]);
  return { songs, playlists };
}
