import { AppState } from 'react-native';

import { getApiClient } from '@/services/api/config';
import { getRepositories } from '@/services/database/repositories';
import { useDownloadStore } from '@/store/downloadStore';
import { useLibraryStore } from '@/store/libraryStore';

import { DownloadManager } from './downloadManager';
import { expoFileTransfer } from './fileTransfer';

let manager: DownloadManager | null = null;

/** The app-wide download manager, wired to the UI stores. */
export function getDownloadManager(): DownloadManager {
  manager ??= new DownloadManager({
    api: getApiClient(),
    getRepositories,
    transfer: expoFileTransfer,
    onChange: (record) => useDownloadStore.getState().upsert(record),
    onSongAdded: () => void useLibraryStore.getState().refresh(),
  });
  return manager;
}

let foregroundHooked = false;

/**
 * Loads download state and resumes unfinished imports. Also resumes on every
 * return to the foreground: iOS suspends JS polling in the background, while
 * the MP3 transfer itself continues in a background URLSession.
 */
export async function initializeDownloads() {
  await useDownloadStore.getState().load();
  const downloads = getDownloadManager();
  await downloads.resumeActive();
  if (!foregroundHooked) {
    foregroundHooked = true;
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void downloads.resumeActive();
    });
  }
}

export { DownloadError } from './errors';
export { STATUS_LABEL, isActive } from './downloadMachine';
