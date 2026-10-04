import type { SqlDatabase } from './types';

/**
 * Ordered schema migrations. Each entry upgrades the schema from
 * `index` to `index + 1`, tracked with `PRAGMA user_version`.
 * Never edit a shipped migration; append a new one instead.
 */
export const MIGRATIONS: readonly string[] = [
  // v1: initial schema
  `
  CREATE TABLE songs (
    id                TEXT PRIMARY KEY NOT NULL,
    provider          TEXT NOT NULL,
    source_id         TEXT NOT NULL,
    source_url        TEXT NOT NULL,
    title             TEXT NOT NULL,
    creator           TEXT NOT NULL,
    duration          INTEGER,
    thumbnail_url     TEXT,
    local_audio_uri   TEXT NOT NULL,
    local_artwork_uri TEXT,
    file_size         INTEGER,
    date_downloaded   INTEGER NOT NULL,
    last_played       INTEGER,
    play_count        INTEGER NOT NULL DEFAULT 0,
    is_favorite       INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    UNIQUE (provider, source_id)
  );
  CREATE INDEX idx_songs_source_url ON songs (source_url);
  CREATE INDEX idx_songs_date_downloaded ON songs (date_downloaded DESC);
  CREATE INDEX idx_songs_last_played ON songs (last_played DESC) WHERE last_played IS NOT NULL;
  CREATE INDEX idx_songs_favorite ON songs (is_favorite) WHERE is_favorite = 1;
  CREATE INDEX idx_songs_title ON songs (title COLLATE NOCASE);
  CREATE INDEX idx_songs_creator ON songs (creator COLLATE NOCASE);

  CREATE TABLE playlists (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_playlists_name ON playlists (name COLLATE NOCASE);

  CREATE TABLE playlist_songs (
    playlist_id TEXT NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
    song_id     TEXT NOT NULL REFERENCES songs (id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    added_at    INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, song_id)
  );
  CREATE INDEX idx_playlist_songs_order ON playlist_songs (playlist_id, position);
  CREATE INDEX idx_playlist_songs_song ON playlist_songs (song_id);

  CREATE TABLE playback_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id   TEXT NOT NULL REFERENCES songs (id) ON DELETE CASCADE,
    played_at INTEGER NOT NULL
  );
  CREATE INDEX idx_history_played_at ON playback_history (played_at DESC);
  CREATE INDEX idx_history_song ON playback_history (song_id);

  CREATE TABLE downloads (
    id             TEXT PRIMARY KEY NOT NULL,
    job_id         TEXT,
    download_token TEXT,
    provider       TEXT NOT NULL,
    source_id      TEXT NOT NULL,
    source_url     TEXT NOT NULL,
    metadata_json  TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN
                     ('validating','preparing','downloading','processing','saving','completed','failed')),
    progress       INTEGER NOT NULL DEFAULT 0,
    error_code     TEXT,
    error_message  TEXT,
    song_id        TEXT REFERENCES songs (id) ON DELETE SET NULL,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );
  CREATE INDEX idx_downloads_status ON downloads (status);
  CREATE INDEX idx_downloads_source ON downloads (provider, source_id);

  CREATE TABLE app_settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Applies connection pragmas. Must run on every new connection. */
export async function applyPragmas(db: SqlDatabase): Promise<void> {
  // Foreign keys are OFF by default in SQLite. Cascading deletes of playlist
  // references and history depend on this.
  await db.execAsync('PRAGMA foreign_keys = ON;');
}

/** Brings the schema up to {@link SCHEMA_VERSION}. Safe to call on every launch. */
export async function migrate(db: SqlDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(`Database schema v${version} is newer than this app (v${SCHEMA_VERSION}).`);
  }
  while (version < SCHEMA_VERSION) {
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      // PRAGMA does not accept bound parameters; `next` is a trusted integer.
      await db.execAsync(`PRAGMA user_version = ${next};`);
    });
    version = next;
  }
}
