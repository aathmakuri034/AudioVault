import type { Repositories } from '@/services/database/repositories';
import { deleteSongFiles, pruneOrphanedFiles } from '@/services/filesystem/musicStorage';
import type { Song } from '@/types/models';

/**
 * Library use cases that span the database and the filesystem.
 * Repositories are injected so these are unit-testable.
 */
export function createLibraryService(repos: Repositories) {
  return {
    /**
     * Deletes a song completely: its database row (playlist references and
     * history cascade with it) and then its MP3 and artwork files.
     * The row goes first so a failure never leaves a song pointing at a
     * deleted file; leftover files are reclaimed by {@link cleanUpOrphans}.
     */
    async deleteSong(songId: string): Promise<Song | null> {
      const song = await repos.songs.delete(songId);
      if (song) {
        try {
          deleteSongFiles(song);
        } catch {
          // Orphaned files are pruned on next launch.
        }
      }
      return song;
    },

    /** Removes files in the music directory that no song row references. */
    async cleanUpOrphans(): Promise<string[]> {
      const songs = await repos.songs.getAll();
      return pruneOrphanedFiles(songs.map((s) => s.id));
    },
  };
}

export type LibraryService = ReturnType<typeof createLibraryService>;
