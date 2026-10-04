import { initializeDownloads } from '@/features/downloads';
import { createLibraryService } from '@/features/library/libraryService';
import { getAudioService, setPlayRecordedListener } from '@/services/audio/playbackService';
import { getRepositories } from '@/services/database/repositories';
import { useLibraryStore } from '@/store/libraryStore';

/**
 * One-time app start-up: open + migrate the database, reclaim orphaned files,
 * load the library snapshot, then configure audio and restore the last queue
 * (paused), and resume unfinished imports. The playback service itself is
 * registered earlier, in index.ts.
 */
export async function initializeApp(): Promise<void> {
  const repos = await getRepositories();
  try {
    await createLibraryService(repos).cleanUpOrphans();
  } catch {
    // Non-fatal: cleanup is retried on the next launch.
  }
  await useLibraryStore.getState().refresh();

  const audio = getAudioService();
  setPlayRecordedListener(() => void useLibraryStore.getState().refresh());
  try {
    await audio.configure();
    await audio.restore();
  } catch {
    // Audio problems must not block the library from opening.
  }
  try {
    await initializeDownloads();
  } catch {
    // Downloads resume on the next foreground event.
  }
}
