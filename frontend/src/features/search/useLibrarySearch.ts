import { useEffect, useRef, useState } from 'react';

import { getRepositories } from '@/services/database/repositories';
import { useLibraryStore } from '@/store/libraryStore';

import { searchLibrary, type SearchResults } from './searchLibrary';

const DEBOUNCE_MS = 200;
const EMPTY: SearchResults = { songs: [], playlists: [] };

/**
 * Debounced offline search. Re-runs when the library changes so results never
 * show deleted songs. Stale responses are discarded.
 */
export function useLibrarySearch(query: string) {
  const songs = useLibraryStore((s) => s.songs);
  const playlists = useLibraryStore((s) => s.playlists);
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const term = query.trim();

  useEffect(() => {
    const id = ++requestId.current;
    if (!term) return;
    const timer = setTimeout(() => {
      getRepositories()
        .then((repos) => searchLibrary(repos, term))
        .then((found) => {
          if (id !== requestId.current) return;
          setResults(found);
          setError(null);
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setResults(EMPTY);
          setError('Search is unavailable right now. Please try again.');
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, songs, playlists]);

  // A blank query shows nothing regardless of the last response.
  return {
    term,
    results: term ? results : EMPTY,
    error: term ? error : null,
    libraryIsEmpty: songs.length === 0 && playlists.length === 0,
  };
}
