import { makeSong } from '@/test-utils/fixtures';
import type { Song } from '@/types/models';

import { QueueManager } from '../queueManager';

function songs(n: number): Song[] {
  return Array.from({ length: n }, (_, i) => ({
    ...makeSong({ id: `s${i}`, title: `T${i}` }),
    dateDownloaded: 0,
    lastPlayed: null,
    playCount: 0,
    isFavorite: false,
  }));
}

/** Deterministic "random" that reverses order under Fisher–Yates. */
const zeroRandom = () => 0;

const ids = (list: (Song | null)[]) => list.map((s) => s?.id ?? null);

describe('QueueManager', () => {
  it('loads songs and starts at the requested index', () => {
    const q = new QueueManager();
    q.load(songs(3), 1);
    expect(q.current()?.id).toBe('s1');
    expect(ids(q.upcoming())).toEqual(['s2']);
  });

  it('handles empty queues', () => {
    const q = new QueueManager();
    q.load([]);
    expect(q.current()).toBeNull();
    expect(q.next()).toBeNull();
    expect(q.previous()).toBeNull();
    expect(q.hasNext()).toBe(false);
  });

  describe('next / previous', () => {
    it('advances and stops at the end with repeat off', () => {
      const q = new QueueManager();
      q.load(songs(2));
      expect(q.next()?.id).toBe('s1');
      expect(q.next()).toBeNull();
      expect(q.current()?.id).toBe('s1');
      expect(q.next('ended')).toBeNull();
    });

    it('wraps with repeat all', () => {
      const q = new QueueManager();
      q.load(songs(2), 1);
      q.setRepeat('all');
      expect(q.next('ended')?.id).toBe('s0');
      expect(q.previous()?.id).toBe('s1');
    });

    it('repeat one replays on track end but Next still advances', () => {
      const q = new QueueManager();
      q.load(songs(3));
      q.setRepeat('one');
      expect(q.next('ended')?.id).toBe('s0');
      expect(q.next('user')?.id).toBe('s1');
    });

    it('previous stays on the first track without repeat', () => {
      const q = new QueueManager();
      q.load(songs(2));
      expect(q.previous()?.id).toBe('s0');
      expect(q.hasPrevious()).toBe(false);
    });

    it('skips to an index', () => {
      const q = new QueueManager();
      q.load(songs(4));
      expect(q.skipTo(3)?.id).toBe('s3');
      expect(q.skipTo(9)).toBeNull();
      expect(q.current()?.id).toBe('s3');
    });
  });

  describe('shuffle', () => {
    it('keeps the chosen song first and shuffles the rest', () => {
      const q = new QueueManager(zeroRandom);
      q.load(songs(4), 2, { shuffle: true });
      expect(q.current()?.id).toBe('s2');
      expect(q.currentIndex).toBe(0);
      expect(ids(q.ordered()).sort()).toEqual(['s0', 's1', 's2', 's3']);
      expect(ids(q.ordered())).not.toEqual(['s2', 's0', 's1', 's3']);
    });

    it('turning shuffle off restores original order at the current song', () => {
      const q = new QueueManager(zeroRandom);
      q.load(songs(4), 0);
      q.next();
      q.setShuffle(true);
      expect(q.current()?.id).toBe('s1');
      q.next();
      const playing = q.current()?.id;
      q.setShuffle(false);
      expect(ids(q.ordered())).toEqual(['s0', 's1', 's2', 's3']);
      expect(q.current()?.id).toBe(playing);
    });
  });

  it('cycles repeat modes off → all → one → off', () => {
    const q = new QueueManager();
    expect([q.cycleRepeat(), q.cycleRepeat(), q.cycleRepeat()]).toEqual(['all', 'one', 'off']);
  });

  describe('queue management', () => {
    it('adds to the end and plays next', () => {
      const q = new QueueManager();
      const [a, b, c, d] = songs(4);
      q.load([a, b]);
      q.add(c);
      q.playNext(d);
      expect(ids(q.ordered())).toEqual(['s0', 's3', 's1', 's2']);
    });

    it('add to an empty queue makes it current', () => {
      const q = new QueueManager();
      q.add(songs(1)[0]);
      expect(q.current()?.id).toBe('s0');
    });

    it('moves entries and keeps the current track current', () => {
      const q = new QueueManager();
      q.load(songs(4), 1);
      q.move(1, 3);
      expect(ids(q.ordered())).toEqual(['s0', 's2', 's3', 's1']);
      expect(q.current()?.id).toBe('s1');
      q.move(0, 2);
      expect(q.current()?.id).toBe('s1');
    });

    it('removes entries before, at and after the current track', () => {
      const q = new QueueManager();
      q.load(songs(5), 2);
      expect(q.removeAt(0)).toBe(false);
      expect(q.current()?.id).toBe('s2');
      expect(q.removeAt(3)).toBe(false);
      expect(ids(q.ordered())).toEqual(['s1', 's2', 's3']);
      expect(q.removeAt(1)).toBe(true);
      expect(q.current()?.id).toBe('s3');
    });

    it('removing the last current track wraps to the start', () => {
      const q = new QueueManager();
      q.load(songs(2), 1);
      expect(q.removeAt(1)).toBe(true);
      expect(q.current()?.id).toBe('s0');
      expect(q.removeAt(0)).toBe(true);
      expect(q.current()).toBeNull();
    });

    it('removes a deleted song everywhere', () => {
      const q = new QueueManager();
      const [a, b] = songs(2);
      q.load([a, b, a]);
      expect(q.removeSong('s0')).toBe(true);
      expect(ids(q.ordered())).toEqual(['s1']);
    });
  });

  describe('snapshot / restore (queue restoration)', () => {
    it('round-trips order, position, shuffle and repeat', () => {
      const list = songs(4);
      const q = new QueueManager(zeroRandom);
      q.load(list, 1, { shuffle: true });
      q.setRepeat('all');
      q.next();
      const snap = q.snapshot();

      const restored = new QueueManager();
      restored.restore(snap, new Map(list.map((s) => [s.id, s])));
      expect(ids(restored.ordered())).toEqual(ids(q.ordered()));
      expect(restored.current()?.id).toBe(q.current()?.id);
      expect(restored.shuffle).toBe(true);
      expect(restored.repeat).toBe('all');
    });

    it('drops songs deleted since the snapshot and keeps a sensible current track', () => {
      const list = songs(4);
      const q = new QueueManager();
      q.load(list, 1);
      const snap = q.snapshot();
      const remaining = new Map(list.filter((s) => s.id !== 's1').map((s) => [s.id, s]));

      const restored = new QueueManager();
      restored.restore(snap, remaining);
      expect(ids(restored.ordered())).toEqual(['s0', 's2', 's3']);
      expect(restored.current()?.id).toBe('s2');
    });

    it('restores to empty when nothing survives', () => {
      const q = new QueueManager();
      q.load(songs(2));
      const restored = new QueueManager();
      restored.restore(q.snapshot(), new Map());
      expect(restored.current()).toBeNull();
    });
  });
});
