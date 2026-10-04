import type { Repositories } from '@/services/database/repositories';
import {
  artworkFileFor,
  audioFileFor,
  deleteSongFiles,
  pruneOrphanedFiles,
} from '@/services/filesystem/musicStorage';
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

    /**
     * Re-points stored file URIs at the current app container. iOS may move
     * the container (app updates, device restores), which invalidates
     * absolute file:// paths; files are always named by song id, so the
     * correct URI can be rebuilt. Returns how many songs were updated.
     */
    async relocateFilePaths(): Promise<number> {
      let updated = 0;
      for (const song of await repos.songs.getAll()) {
        const audio = audioFileFor(song.id).uri;
        const artwork = song.localArtworkUri ? artworkFileFor(song.id).uri : null;
        if (song.localAudioUri !== audio || song.localArtworkUri !== artwork) {
          await repos.songs.updateFileUris(song.id, audio, artwork);
          updated += 1;
        }
      }
      return updated;
    },

    /** Removes files in the music directory that no song row references. */
    async cleanUpOrphans(): Promise<string[]> {
      const songs = await repos.songs.getAll();
      return pruneOrphanedFiles(songs.map((s) => s.id));
    },
  };
}

export type LibraryService = ReturnType<typeof createLibraryService>;
