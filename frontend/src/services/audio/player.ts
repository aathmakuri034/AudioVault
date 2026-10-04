import { z } from 'zod';

import { SettingKeys, type Repositories } from '@/services/database/repositories';
import { MissingAudioFileError, resolvePlayableUri } from '@/services/filesystem/musicStorage';
import { usePlayerStore, type PlayerState } from '@/store/playerStore';
import type { Song } from '@/types/models';

import type { AudioEngine, EngineStatus, RemoteCommand } from './engine';
import { QueueManager } from './queueManager';

/** Pressing Previous after this many seconds restarts the track instead. */
export const RESTART_THRESHOLD_SECONDS = 3;
const PERSIST_INTERVAL_MS = 5000;
/**
 * Status events carry no track identity, so events arriving this soon after a
 * load may still describe the previous track. Track-end and play-recording
 * decisions ignore them to avoid double-advancing or miscounting a play.
 */
export const STALE_STATUS_MS = 750;

const persistedStateSchema = z.object({
  queue: z.object({
    songIds: z.array(z.string()),
    order: z.array(z.number().int()),
    position: z.number().int(),
    shuffle: z.boolean(),
    repeat: z.enum(['off', 'all', 'one']),
  }),
  positionSeconds: z.number().nonnegative(),
});

export type AudioServiceDeps = {
  engine: AudioEngine;
  getRepositories: () => Promise<Repositories>;
  /** Maps a song to a playable local URI; throws MissingAudioFileError. */
  resolveUri?: (song: Song) => string;
  /** Called after a play is recorded so read models (recently played) refresh. */
  onPlayRecorded?: () => void;
  setState?: (partial: Partial<PlayerState>) => void;
  random?: () => number;
  now?: () => number;
};

/**
 * Application-level playback service. It owns the queue and drives the audio
 * engine; it is not tied to any React component. UI reads the player store
 * and calls these methods. Native remote events (Lock Screen, Control Center,
 * headset) arrive through the engine and are handled here, so they work no
 * matter which screen is visible or whether the app is backgrounded.
 */
export class AudioService {
  private readonly engine: AudioEngine;
  private readonly queue: QueueManager;
  private readonly deps: AudioServiceDeps;
  private readonly setState: (partial: Partial<PlayerState>) => void;
  private attached = false;
  private unsubscribers: (() => void)[] = [];
  /** Increments per load so a play is counted once per load, not per status tick. */
  private loadToken = 0;
  private recordedToken = -1;
  private lastPersist = 0;
  private loadedAt = 0;
  /** Last known position of the current track, for persistence. */
  private position = 0;
  /** loadToken for which a playback error was already handled. */
  private erroredToken = -1;

  constructor(deps: AudioServiceDeps) {
    this.deps = deps;
    this.engine = deps.engine;
    this.queue = new QueueManager(deps.random);
    this.setState = deps.setState ?? ((partial) => usePlayerStore.setState(partial));
  }

  /** Subscribes to engine status and remote commands. Idempotent. */
  attach() {
    if (this.attached) return;
    this.attached = true;
    this.unsubscribers.push(
      this.engine.onStatus((status) => void this.handleStatus(status)),
      this.engine.onRemoteCommand((command) => void this.handleRemoteCommand(command)),
    );
  }

  detach() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.attached = false;
  }

  async configure() {
    await this.engine.configure();
  }

  // ---------------------------------------------------------------- playback

  async playSongs(songs: Song[], startIndex = 0, options: { shuffle?: boolean } = {}) {
    if (songs.length === 0) return;
    this.queue.load(songs, startIndex, options);
    await this.loadCurrent({ autoplay: true });
  }

  /** Plays one song, keeping `context` (e.g. the visible list) as the queue. */
  async playSong(song: Song, context: Song[] = [song]) {
    const index = context.findIndex((s) => s.id === song.id);
    await this.playSongs(index >= 0 ? context : [song], Math.max(index, 0));
  }

  play() {
    if (!this.queue.current()) return;
    const status = this.engine.getStatus();
    if (status.duration > 0 && status.position >= status.duration - 0.25) {
      void this.engine.seekTo(0);
    }
    this.engine.play();
  }

  pause() {
    this.engine.pause();
    void this.persist(true);
  }

  togglePlayPause() {
    if (this.engine.getStatus().isPlaying) this.pause();
    else this.play();
  }

  /** Skipping always starts playback, as in most music players. */
  async next() {
    if (!this.queue.next('user')) return;
    await this.loadCurrent({ autoplay: true });
  }

  async previous() {
    const status = this.engine.getStatus();
    if (status.position > RESTART_THRESHOLD_SECONDS || !this.queue.hasPrevious()) {
      await this.engine.seekTo(0);
      this.setState({ position: 0 });
      return;
    }
    this.queue.previous();
    await this.loadCurrent({ autoplay: true });
  }

  async seekTo(seconds: number) {
    const duration = this.engine.getStatus().duration || Number.MAX_SAFE_INTEGER;
    const target = Math.min(Math.max(0, seconds), duration);
    await this.engine.seekTo(target);
    this.setState({ position: target });
  }

  async skipBy(deltaSeconds: number) {
    await this.seekTo(this.engine.getStatus().position + deltaSeconds);
  }

  toggleShuffle() {
    this.queue.setShuffle(!this.queue.shuffle);
    this.publishQueue();
    void this.persist(true);
  }

  cycleRepeat() {
    this.queue.cycleRepeat();
    this.publishQueue();
    void this.persist(true);
  }

  // --------------------------------------------------------- queue editing

  addToQueue(song: Song) {
    const wasEmpty = this.queue.isEmpty;
    this.queue.add(song);
    if (wasEmpty) void this.loadCurrent({ autoplay: false });
    else this.publishQueue();
    void this.persist(true);
  }

  playNext(song: Song) {
    const wasEmpty = this.queue.isEmpty;
    this.queue.playNext(song);
    if (wasEmpty) void this.loadCurrent({ autoplay: false });
    else this.publishQueue();
    void this.persist(true);
  }

  async skipToQueueIndex(index: number) {
    if (!this.queue.skipTo(index)) return;
    await this.loadCurrent({ autoplay: true });
  }

  moveInQueue(from: number, to: number) {
    this.queue.move(from, to);
    this.publishQueue();
    void this.persist(true);
  }

  async removeFromQueue(index: number) {
    await this.afterRemoval(() => this.queue.removeAt(index));
  }

  /** Call after a song is deleted from the library. */
  async handleSongDeleted(songId: string) {
    await this.afterRemoval(() => this.queue.removeSong(songId));
  }

  /**
   * Applies a queue removal. If the current track was removed, the next one
   * takes over (keeping play/pause state), except when the removal wrapped
   * back to the start of the queue: then it waits, paused.
   */
  private async afterRemoval(remove: () => boolean) {
    const wasPlaying = this.engine.getStatus().isPlaying;
    const indexBefore = this.queue.currentIndex;
    if (remove()) {
      const wrapped = this.queue.currentIndex < indexBefore;
      await this.loadCurrent({ autoplay: wasPlaying && !wrapped });
    } else {
      this.publishQueue();
    }
    void this.persist(true);
  }

  /** Refreshes song objects in the queue, e.g. after a favorite toggle. */
  updateSongs(songs: Song[]) {
    songs.forEach((s) => this.queue.updateSong(s));
    this.publishQueue();
  }

  // ------------------------------------------------- lifecycle & persistence

  /**
   * Re-reads the engine after returning from the background so the UI shows
   * the real position/state. Never restarts the track.
   */
  syncFromEngine() {
    const status = this.engine.getStatus();
    this.position = status.position;
    this.setState({
      isPlaying: status.isPlaying,
      isBuffering: status.isBuffering,
      position: status.position,
      duration: status.duration || this.queue.current()?.duration || 0,
    });
  }

  /** Restores the last session's queue, paused at the saved position. */
  async restore() {
    const repos = await this.deps.getRepositories();
    const saved = await repos.settings.get(SettingKeys.playerState, persistedStateSchema);
    if (!saved || saved.queue.songIds.length === 0) return;
    const songs = await repos.songs.getByIds(saved.queue.songIds);
    this.queue.restore(saved.queue, new Map(songs.map((s) => [s.id, s])));
    if (this.queue.isEmpty) return;
    const sameSong = saved.queue.songIds[saved.queue.order[saved.queue.position]];
    const startAt = this.queue.current()?.id === sameSong ? saved.positionSeconds : 0;
    await this.loadCurrent({ autoplay: false, startAt });
  }

  async persist(force = false) {
    const now = this.now();
    if (!force && now - this.lastPersist < PERSIST_INTERVAL_MS) return;
    this.lastPersist = now;
    try {
      const repos = await this.deps.getRepositories();
      await repos.settings.set(SettingKeys.playerState, {
        queue: this.queue.snapshot(),
        positionSeconds: Math.max(0, this.position),
      });
    } catch {
      // Persistence is best effort; playback must never fail because of it.
    }
  }

  // ---------------------------------------------------------------- internals

  private async loadCurrent({ autoplay, startAt }: { autoplay: boolean; startAt?: number }) {
    let skippedError: string | null = null;
    // Each failed attempt removes that entry from the queue, so this always
    // terminates: either a track loads or the queue empties.
    for (;;) {
      const song = this.queue.current();
      if (!song) {
        this.engine.stop();
        this.position = 0;
        this.setState({
          currentSong: null,
          isPlaying: false,
          position: 0,
          duration: 0,
        });
        this.publishQueue();
        return;
      }
      try {
        const uri = (this.deps.resolveUri ?? resolvePlayableUri)(song);
        this.loadToken += 1;
        this.engine.load(
          {
            id: song.id,
            uri,
            title: song.title,
            artist: song.creator,
            artworkUri: song.localArtworkUri,
            duration: song.duration,
          },
          { autoplay, startAt },
        );
        this.loadedAt = this.now();
        this.position = startAt ?? 0;
        this.setState({
          currentSong: song,
          position: startAt ?? 0,
          duration: song.duration ?? 0,
          isPlaying: autoplay,
          // Keep a skip notice visible after falling through to a later track.
          error: skippedError,
        });
        this.publishQueue();
        void this.persist(true);
        return;
      } catch (error) {
        if (!(error instanceof MissingAudioFileError)) throw error;
        skippedError = error.message;
        this.setState({ error: skippedError });
        // Drop the broken entry and try whatever is now current.
        this.queue.removeAt(this.queue.currentIndex);
        startAt = undefined;
      }
    }
  }

  private publishQueue() {
    const canGoNext = this.queue.hasNext();
    const canGoPrevious = !this.queue.isEmpty;
    this.engine.setRemoteNavigation(canGoNext, canGoPrevious);
    this.setState({
      queue: this.queue.ordered(),
      queueIndex: this.queue.currentIndex,
      shuffle: this.queue.shuffle,
      repeat: this.queue.repeat,
      canGoNext,
      canGoPrevious,
    });
  }

  private async handleStatus(status: EngineStatus) {
    const fresh = this.now() - this.loadedAt >= STALE_STATUS_MS;
    if (fresh) this.position = status.position;
    this.setState({
      isPlaying: status.isPlaying,
      isBuffering: status.isBuffering,
      ...(fresh ? { position: status.position } : {}),
      ...(status.duration > 0 ? { duration: status.duration } : {}),
    });
    if (!fresh) return;

    if (status.error && this.erroredToken !== this.loadToken) {
      await this.handlePlaybackError();
      return;
    }

    const song = this.queue.current();
    if (song && status.isPlaying && this.recordedToken !== this.loadToken) {
      this.recordedToken = this.loadToken;
      void this.recordPlay(song.id);
    }

    if (status.didJustFinish) {
      await this.handleTrackEnded();
      return;
    }
    if (status.isPlaying) void this.persist();
  }

  private async handleTrackEnded() {
    const finished = this.queue.current();
    const nextSong = this.queue.next('ended');
    if (nextSong && finished && nextSong.id === finished.id && this.queue.repeat === 'one') {
      this.loadToken += 1; // a repeat counts as a new play
      await this.engine.seekTo(0);
      this.engine.play();
      return;
    }
    if (nextSong) {
      await this.loadCurrent({ autoplay: true });
      return;
    }
    // End of queue with repeat off: rewind the last track and stop.
    const token = this.loadToken;
    await this.engine.seekTo(0);
    if (token !== this.loadToken) return; // the user started something else meanwhile
    this.engine.pause();
    this.position = 0;
    this.setState({ isPlaying: false, position: 0 });
    void this.persist(true);
  }

  /** A file that exists but won't decode: tell the user and move on. */
  private async handlePlaybackError() {
    this.erroredToken = this.loadToken;
    this.setState({ error: 'This track couldn’t be played. The file may be damaged.' });
    if (this.queue.hasNext()) {
      this.queue.next('user');
      const skipped = this.queue.current();
      await this.loadCurrent({ autoplay: true });
      if (skipped) this.setState({ error: 'Skipped a track that couldn’t be played.' });
    } else {
      this.engine.pause();
      this.setState({ isPlaying: false });
    }
  }

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  private async handleRemoteCommand(command: RemoteCommand) {
    if (command === 'next') await this.next();
    else await this.previous();
  }

  private async recordPlay(songId: string) {
    try {
      const repos = await this.deps.getRepositories();
      await repos.songs.recordPlay(songId, this.now());
      this.deps.onPlayRecorded?.();
    } catch {
      // History is non-critical.
    }
  }
}
