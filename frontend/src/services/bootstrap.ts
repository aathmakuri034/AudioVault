import { createLibraryService } from '@/features/library/libraryService';
import { getRepositories } from '@/services/database/repositories';
import { useLibraryStore } from '@/store/libraryStore';

/**
 * One-time app start-up: open + migrate the database, reclaim orphaned files,
 * and load the library snapshot. Later phases add the audio service and
 * download resumption here.
 */
export async function initializeApp(): Promise<void> {
  const repos = await getRepositories();
  try {
    await createLibraryService(repos).cleanUpOrphans();
  } catch {
    // Non-fatal: cleanup is retried on the next launch.
  }
  await useLibraryStore.getState().refresh();
}
