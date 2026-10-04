import { File } from 'expo-file-system';

export type TransferProgress = { bytesWritten: number; totalBytes: number };

/** Moves bytes from the server into private storage. Swappable for tests. */
export interface FileTransfer {
  /** Streams a (large) file to `destUri`; continues in the background on iOS. */
  download(
    url: string,
    destUri: string,
    options: {
      headers?: Record<string, string>;
      onProgress?: (progress: TransferProgress) => void;
      signal?: AbortSignal;
    },
  ): Promise<{ uri: string; size: number }>;
  /** Small best-effort download (artwork). */
  downloadSmall(url: string, destUri: string): Promise<{ uri: string }>;
  delete(uri: string): void;
}

/**
 * expo-file-system implementation. The MP3 transfer uses a background
 * URLSession on iOS (`sessionType: 'background'`), so it keeps going while the
 * app is backgrounded or the screen is locked.
 */
export const expoFileTransfer: FileTransfer = {
  async download(url, destUri, { headers, onProgress, signal }) {
    const dest = new File(destUri);
    if (dest.exists) dest.delete(); // a previous attempt may have left a partial file
    const task = File.createDownloadTask(url, dest, {
      headers,
      sessionType: 'background',
      onProgress,
      signal,
    });
    const file = await task.downloadAsync();
    if (!file) throw new Error('cancelled');
    return { uri: file.uri, size: file.size };
  },

  async downloadSmall(url, destUri) {
    const file = await File.downloadFileAsync(url, new File(destUri), { idempotent: true });
    return { uri: file.uri };
  },

  delete(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
};
