import { useEffect, useState } from 'react';

import { getRepositories } from '@/services/database/repositories';
import { useLibraryStore } from '@/store/libraryStore';
import type { Playlist, Song } from '@/types/models';

/**
 * Loads a playlist and its ordered songs from SQLite, reloading whenever the
 * library snapshot changes (adds, removals, reorders, deletes).
 */
export function usePlaylist(id: string | undefined) {
  const playlist = useLibraryStore((s) => s.playlists.find((p) => p.id === id) ?? null);
  // Any library refresh produces new arrays; use them as a change signal.
  const libraryVersion = useLibraryStore((s) => s.playlists);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getRepositories()
      .then((repos) => repos.playlists.getSongs(id))
      .then((result) => {
        if (cancelled) return;
        setSongs(result);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, libraryVersion]);

  return { playlist: playlist as Playlist | null, songs, loaded };
}
