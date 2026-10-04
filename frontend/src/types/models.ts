/**
 * Domain models shared across the app. These are the app-facing shapes;
 * the database layer maps snake_case rows into them.
 */

export type Song = {
  id: string;
  provider: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  creator: string;
  /** Duration in seconds, or null if unknown. */
  duration: number | null;
  thumbnailUrl: string | null;
  /** Absolute file:// URI inside private app storage. Never a remote URL. */
  localAudioUri: string;
  localArtworkUri: string | null;
  fileSize: number | null;
  /** Epoch milliseconds. */
  dateDownloaded: number;
  lastPlayed: number | null;
  playCount: number;
  isFavorite: boolean;
};

export type NewSong = Omit<Song, 'lastPlayed' | 'playCount' | 'isFavorite' | 'dateDownloaded'> & {
  dateDownloaded?: number;
};

export type Playlist = {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  songCount: number;
  /** Artwork of the first song, used as the playlist cover. */
  artworkUri: string | null;
};

export type PlaylistEntry = {
  playlistId: string;
  song: Song;
  position: number;
  addedAt: number;
};

export type RepeatMode = 'off' | 'all' | 'one';

/** UI-facing download lifecycle. These are the states the spec requires. */
export type DownloadStatus =
  | 'validating'
  | 'preparing'
  | 'downloading'
  | 'processing'
  | 'saving'
  | 'completed'
  | 'failed';

export type MediaMetadata = {
  provider: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  creator: string;
  thumbnail: string | null;
  duration: number | null;
};

export type DownloadRecord = {
  id: string;
  jobId: string | null;
  downloadToken: string | null;
  metadata: MediaMetadata;
  status: DownloadStatus;
  /** 0–100 overall progress. */
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  songId: string | null;
  createdAt: number;
  updatedAt: number;
};
