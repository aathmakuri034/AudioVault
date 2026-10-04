import { Directory, File, Paths } from 'expo-file-system';

/**
 * Private on-device storage for downloaded audio and artwork.
 *
 * Files live under `<Documents>/music/` inside the app sandbox. That directory
 * is NOT exposed to the iOS Files app (UIFileSharingEnabled is off) and is not
 * an Android public media folder. File names are always `{songId}.{ext}` with a
 * UUID song id, never titles.
 */
const MUSIC_DIR_NAME = 'music';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Headroom kept free on the device beyond the file itself. */
export const STORAGE_SAFETY_MARGIN_BYTES = 50 * 1024 * 1024;

export class MissingAudioFileError extends Error {
  constructor(public readonly songId: string) {
    super('This track’s audio file is missing. Delete it and download it again.');
    this.name = 'MissingAudioFileError';
  }
}

export function getMusicDirectory(): Directory {
  const dir = new Directory(Paths.document, MUSIC_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function assertSafeId(songId: string) {
  if (!UUID_RE.test(songId)) throw new Error('Song ids used for file names must be UUIDs.');
}

export function audioFileFor(songId: string): File {
  assertSafeId(songId);
  return new File(getMusicDirectory(), `${songId}.mp3`);
}

export function artworkFileFor(songId: string): File {
  assertSafeId(songId);
  return new File(getMusicDirectory(), `${songId}.jpg`);
}

/** True when `uri` points inside the private music directory. */
export function isInsideMusicDirectory(uri: string): boolean {
  const base = getMusicDirectory().uri.replace(/\/?$/, '/');
  return uri.startsWith(base) && !uri.slice(base.length).includes('..');
}

/**
 * Resolves the URI the player should load for a song. Playback must use the
 * local file, never the original remote URL, so this refuses anything else.
 */
export function resolvePlayableUri(song: { id: string; localAudioUri: string }): string {
  if (!song.localAudioUri.startsWith('file://') || !isInsideMusicDirectory(song.localAudioUri)) {
    throw new MissingAudioFileError(song.id);
  }
  if (!new File(song.localAudioUri).exists) throw new MissingAudioFileError(song.id);
  return song.localAudioUri;
}

function deleteIfInside(uri: string | null | undefined): void {
  if (!uri || !isInsideMusicDirectory(uri)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

/** Removes a song's audio and artwork files. Missing files are ignored. */
export function deleteSongFiles(song: { localAudioUri: string; localArtworkUri: string | null }) {
  deleteIfInside(song.localAudioUri);
  deleteIfInside(song.localArtworkUri);
}

/**
 * Deletes files in the music directory that no song references, e.g. after
 * an interrupted download or a crash between the DB delete and file delete.
 * Returns the names of removed files.
 */
export function pruneOrphanedFiles(knownSongIds: Iterable<string>): string[] {
  const known = new Set(knownSongIds);
  const removed: string[] = [];
  for (const entry of getMusicDirectory().list()) {
    if (!(entry instanceof File)) continue;
    const id = entry.name.replace(/\.(mp3|jpg|part)$/i, '');
    if (!known.has(id)) {
      entry.delete();
      removed.push(entry.name);
    }
  }
  return removed;
}

export function getAvailableBytes(): number {
  return Paths.availableDiskSpace;
}

/** Whether `bytes` fit on the device while keeping a safety margin free. */
export function hasSpaceFor(bytes: number): boolean {
  return getAvailableBytes() - bytes >= STORAGE_SAFETY_MARGIN_BYTES;
}

/** Rough MP3 size for a duration at the backend's bitrate, plus 10% headroom. */
export function estimateMp3Bytes(durationSeconds: number | null, kbps = 192): number {
  const seconds = durationSeconds ?? 10 * 60;
  return Math.ceil(((seconds * kbps * 1000) / 8) * 1.1);
}
