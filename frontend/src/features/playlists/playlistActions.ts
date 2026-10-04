import { getRepositories } from '@/services/database/repositories';
import { useLibraryStore } from '@/store/libraryStore';
import type { Playlist } from '@/types/models';

/**
 * Playlist use cases. Each writes through the repository (SQLite is the
 * source of truth, fully offline) and then refreshes the library snapshot.
 */
const refresh = () => useLibraryStore.getState().refresh();

export async function createPlaylist(input: {
  name: string;
  description?: string | null;
  initialSongId?: string;
}): Promise<Playlist> {
  const repos = await getRepositories();
  const playlist = await repos.playlists.create(input);
  if (input.initialSongId) await repos.playlists.addSong(playlist.id, input.initialSongId);
  await refresh();
  return playlist;
}

export async function updatePlaylist(
  id: string,
  changes: { name?: string; description?: string | null },
) {
  const repos = await getRepositories();
  await repos.playlists.update(id, changes);
  await refresh();
}

export async function deletePlaylist(id: string) {
  const repos = await getRepositories();
  await repos.playlists.delete(id);
  await refresh();
}

/** Returns false when the song was already in the playlist. */
export async function addSongToPlaylist(playlistId: string, songId: string): Promise<boolean> {
  const repos = await getRepositories();
  const added = await repos.playlists.addSong(playlistId, songId);
  await refresh();
  return added;
}

export async function removeSongFromPlaylist(playlistId: string, songId: string) {
  const repos = await getRepositories();
  await repos.playlists.removeSong(playlistId, songId);
  await refresh();
}

export async function moveSongInPlaylist(playlistId: string, from: number, to: number) {
  const repos = await getRepositories();
  await repos.playlists.moveSong(playlistId, from, to);
  await refresh();
}
