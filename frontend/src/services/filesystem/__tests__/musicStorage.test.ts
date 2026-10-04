import { fakeFs } from '@/test-utils/fakeFileSystem';

import {
  MissingAudioFileError,
  STORAGE_SAFETY_MARGIN_BYTES,
  artworkFileFor,
  audioFileFor,
  deleteSongFiles,
  estimateMp3Bytes,
  hasSpaceFor,
  isInsideMusicDirectory,
  pruneOrphanedFiles,
  resolvePlayableUri,
} from '../musicStorage';

jest.mock('expo-file-system', () => require('@/test-utils/fakeFileSystem').fakeExpoFileSystem);

const ID = '3f1c2b4a-1111-4222-8333-944455556666';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const MUSIC = 'file:///sandbox/Documents/music/';

beforeEach(() => fakeFs.reset());

describe('musicStorage', () => {
  it('names files by song UUID inside the private music directory', () => {
    expect(audioFileFor(ID).uri).toBe(`${MUSIC}${ID}.mp3`);
    expect(artworkFileFor(ID).uri).toBe(`${MUSIC}${ID}.jpg`);
  });

  it('refuses non-UUID ids so titles can never become paths', () => {
    expect(() => audioFileFor('../../etc/passwd')).toThrow(/UUID/);
    expect(() => audioFileFor('My Song Title')).toThrow(/UUID/);
  });

  it('detects paths inside the music directory', () => {
    expect(isInsideMusicDirectory(`${MUSIC}${ID}.mp3`)).toBe(true);
    expect(isInsideMusicDirectory(`${MUSIC}../secret.mp3`)).toBe(false);
    expect(isInsideMusicDirectory('file:///sandbox/Documents/other.mp3')).toBe(false);
  });

  describe('offline playback path resolution', () => {
    it('returns the local file URI when present', () => {
      fakeFs.writeFile(`${MUSIC}${ID}.mp3`);
      expect(resolvePlayableUri({ id: ID, localAudioUri: `${MUSIC}${ID}.mp3` })).toBe(
        `${MUSIC}${ID}.mp3`,
      );
    });

    it('never resolves to a remote URL', () => {
      expect(() =>
        resolvePlayableUri({ id: ID, localAudioUri: 'https://www.youtube.com/watch?v=x' }),
      ).toThrow(MissingAudioFileError);
    });

    it('reports a missing local file', () => {
      expect(() => resolvePlayableUri({ id: ID, localAudioUri: `${MUSIC}${ID}.mp3` })).toThrow(
        MissingAudioFileError,
      );
    });
  });

  describe('cleanup', () => {
    it('deletes audio and artwork, ignoring missing files', () => {
      fakeFs.writeFile(`${MUSIC}${ID}.mp3`);
      deleteSongFiles({ localAudioUri: `${MUSIC}${ID}.mp3`, localArtworkUri: `${MUSIC}${ID}.jpg` });
      expect(fakeFs.entries.has(`${MUSIC}${ID}.mp3`)).toBe(false);
    });

    it('never deletes outside the music directory', () => {
      fakeFs.writeFile('file:///sandbox/Documents/audiovault.db');
      deleteSongFiles({
        localAudioUri: 'file:///sandbox/Documents/audiovault.db',
        localArtworkUri: null,
      });
      expect(fakeFs.entries.has('file:///sandbox/Documents/audiovault.db')).toBe(true);
    });

    it('prunes orphaned files not referenced by any song', () => {
      fakeFs.writeFile(`${MUSIC}${ID}.mp3`);
      fakeFs.writeFile(`${MUSIC}${ID}.jpg`);
      fakeFs.writeFile(`${MUSIC}${OTHER}.mp3`);
      fakeFs.writeFile(`${MUSIC}${OTHER}.part`);
      const removed = pruneOrphanedFiles([ID]);
      expect(removed.sort()).toEqual([`${OTHER}.mp3`, `${OTHER}.part`]);
      expect(fakeFs.entries.has(`${MUSIC}${ID}.mp3`)).toBe(true);
    });
  });

  describe('storage checks', () => {
    it('keeps a safety margin free', () => {
      fakeFs.availableDiskSpace = STORAGE_SAFETY_MARGIN_BYTES + 1000;
      expect(hasSpaceFor(1000)).toBe(true);
      expect(hasSpaceFor(1001)).toBe(false);
    });

    it('estimates MP3 size from duration', () => {
      expect(estimateMp3Bytes(60)).toBe(Math.ceil(((60 * 192000) / 8) * 1.1));
      expect(estimateMp3Bytes(null)).toBeGreaterThan(estimateMp3Bytes(60));
    });
  });
});
