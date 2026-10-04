import type { RepeatMode, Song } from '@/types/models';

export type QueueSnapshot = {
  /** Song ids in their original (unshuffled) order. */
  songIds: string[];
  /** Play order as indices into `songIds`. */
  order: number[];
  /** Index into `order` of the current track. */
  position: number;
  shuffle: boolean;
  repeat: RepeatMode;
};

export type AdvanceReason = 'user' | 'ended';

/**
 * Pure playback-queue logic: ordering, shuffle, repeat and editing.
 * Owns no audio; the AudioService asks it what to play next.
 *
 * The queue keeps the original list (`songs`) and a play `order` of indices
 * into it, so turning shuffle off restores the original sequence.
 */
export class QueueManager {
  private songs: Song[] = [];
  private order: number[] = [];
  private position = -1;
  private _shuffle = false;
  private _repeat: RepeatMode = 'off';

  constructor(private readonly random: () => number = Math.random) {}

  get shuffle() {
    return this._shuffle;
  }

  get repeat() {
    return this._repeat;
  }

  get isEmpty() {
    return this.order.length === 0;
  }

  /** Index of the current track within the play order. */
  get currentIndex() {
    return this.position;
  }

  get length() {
    return this.order.length;
  }

  current(): Song | null {
    if (this.position < 0 || this.position >= this.order.length) return null;
    return this.songs[this.order[this.position]] ?? null;
  }

  /** The queue in play order. */
  ordered(): Song[] {
    return this.order.map((i) => this.songs[i]);
  }

  upcoming(): Song[] {
    return this.ordered().slice(this.position + 1);
  }

  /**
   * Replaces the queue. With shuffle, the chosen start track plays first and
   * the rest are shuffled after it.
   */
  load(songs: Song[], startIndex = 0, options: { shuffle?: boolean } = {}) {
    this.songs = [...songs];
    this.order = songs.map((_, i) => i);
    const start = songs.length === 0 ? -1 : clamp(startIndex, 0, songs.length - 1);
    this.position = start;
    this._shuffle = options.shuffle ?? this._shuffle;
    if (this._shuffle && start >= 0) this.shuffleAround(start);
  }

  clear() {
    this.songs = [];
    this.order = [];
    this.position = -1;
  }

  /**
   * Moves forward and returns the new current song, or null when playback
   * should stop.
   * - `ended` (track finished): repeat-one replays; at the end, repeat-all
   *   wraps and off stops.
   * - `user` (Next pressed): always advances, even with repeat-one; at the
   *   end it wraps only with repeat-all.
   */
  next(reason: AdvanceReason = 'user'): Song | null {
    if (this.isEmpty) return null;
    if (reason === 'ended' && this._repeat === 'one') return this.current();
    if (this.position < this.order.length - 1) {
      this.position += 1;
      return this.current();
    }
    if (this._repeat === 'all') {
      this.position = 0;
      return this.current();
    }
    return null;
  }

  /** Steps back one track; wraps to the end only with repeat-all. */
  previous(): Song | null {
    if (this.isEmpty) return null;
    if (this.position > 0) {
      this.position -= 1;
    } else if (this._repeat === 'all') {
      this.position = this.order.length - 1;
    }
    return this.current();
  }

  hasNext(): boolean {
    return this.position < this.order.length - 1 || (this._repeat === 'all' && !this.isEmpty);
  }

  hasPrevious(): boolean {
    return this.position > 0 || (this._repeat === 'all' && !this.isEmpty);
  }

  /** Jumps to a position in the play order. */
  skipTo(index: number): Song | null {
    if (index < 0 || index >= this.order.length) return null;
    this.position = index;
    return this.current();
  }

  setShuffle(on: boolean) {
    if (on === this._shuffle) return;
    this._shuffle = on;
    if (this.isEmpty) return;
    const currentSongIndex = this.order[this.position];
    if (on) {
      this.shuffleAround(currentSongIndex);
    } else {
      this.order = this.songs.map((_, i) => i);
      this.position = currentSongIndex;
    }
  }

  setRepeat(mode: RepeatMode) {
    this._repeat = mode;
  }

  /** off → all → one → off */
  cycleRepeat(): RepeatMode {
    const nextMode: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
    this._repeat = nextMode[this._repeat];
    return this._repeat;
  }

  /** Appends to the end of the queue. */
  add(song: Song) {
    this.songs.push(song);
    this.order.push(this.songs.length - 1);
    if (this.position < 0) this.position = 0;
  }

  /** Inserts right after the current track. */
  playNext(song: Song) {
    this.songs.push(song);
    this.order.splice(this.position + 1, 0, this.songs.length - 1);
    if (this.position < 0) this.position = 0;
  }

  /** Reorders the play order. Moving the current track keeps it current. */
  move(from: number, to: number) {
    const len = this.order.length;
    if (from < 0 || from >= len || to < 0 || to >= len || from === to) return;
    const currentSongIndex = this.order[this.position];
    const [item] = this.order.splice(from, 1);
    this.order.splice(to, 0, item);
    this.position = this.order.indexOf(currentSongIndex);
  }

  /**
   * Removes the entry at a play-order index. Returns true if the current
   * track was removed, in which case the caller must load the new current().
   */
  removeAt(index: number): boolean {
    if (index < 0 || index >= this.order.length) return false;
    const wasCurrent = index === this.position;
    const songIndex = this.order[index];
    this.order.splice(index, 1);
    // Drop the song and re-index so `songs` never holds unreachable entries.
    this.songs.splice(songIndex, 1);
    this.order = this.order.map((i) => (i > songIndex ? i - 1 : i));
    if (index < this.position) this.position -= 1;
    if (this.order.length === 0) this.position = -1;
    else if (this.position >= this.order.length)
      this.position = wasCurrent ? 0 : this.order.length - 1;
    return wasCurrent;
  }

  /** Removes every entry for a song (e.g. it was deleted). Returns true if it was current. */
  removeSong(songId: string): boolean {
    let removedCurrent = false;
    for (let i = this.order.length - 1; i >= 0; i -= 1) {
      if (this.songs[this.order[i]]?.id === songId) {
        removedCurrent = this.removeAt(i) || removedCurrent;
      }
    }
    return removedCurrent;
  }

  /** Replaces song objects (e.g. after a favorite toggle) without changing order. */
  updateSong(song: Song) {
    this.songs = this.songs.map((s) => (s.id === song.id ? song : s));
  }

  snapshot(): QueueSnapshot {
    return {
      songIds: this.songs.map((s) => s.id),
      order: [...this.order],
      position: this.position,
      shuffle: this._shuffle,
      repeat: this._repeat,
    };
  }

  /**
   * Restores a snapshot. Songs that no longer exist are dropped; if the
   * current one is gone, the next surviving track becomes current.
   */
  restore(snapshot: QueueSnapshot, songsById: Map<string, Song>) {
    this._shuffle = snapshot.shuffle;
    this._repeat = snapshot.repeat;
    const kept: Song[] = [];
    const remap = new Map<number, number>();
    snapshot.songIds.forEach((id, i) => {
      const song = songsById.get(id);
      if (song) {
        remap.set(i, kept.length);
        kept.push(song);
      }
    });
    this.songs = kept;
    const currentOld = snapshot.order[snapshot.position];
    const validOrder = snapshot.order.filter((i) => remap.has(i));
    this.order = validOrder.map((i) => remap.get(i)!);
    if (this.order.length === 0) {
      this.position = -1;
      return;
    }
    if (remap.has(currentOld)) {
      this.position = this.order.indexOf(remap.get(currentOld)!);
    } else {
      // Current song vanished: continue with the first later track that survived.
      const later = snapshot.order.slice(snapshot.position + 1).find((i) => remap.has(i));
      this.position = later != null ? this.order.indexOf(remap.get(later)!) : 0;
    }
  }

  /** Fisher–Yates shuffle of everything except `firstSongIndex`, which goes first. */
  private shuffleAround(firstSongIndex: number) {
    const rest = this.songs.map((_, i) => i).filter((i) => i !== firstSongIndex);
    for (let i = rest.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.order = [firstSongIndex, ...rest];
    this.position = 0;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}
