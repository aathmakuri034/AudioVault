import { randomUUID } from 'expo-crypto';

/** RFC 4122 v4 identifier used for songs, playlists, downloads and file names. */
export function createId(): string {
  return randomUUID();
}
