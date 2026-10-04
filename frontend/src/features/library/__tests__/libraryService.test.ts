import { createRepositories } from '@/services/database/repositories';
import { fakeFs } from '@/test-utils/fakeFileSystem';
import { makeSong } from '@/test-utils/fixtures';
import { createTestDb } from '@/test-utils/sqliteTestDb';

import { createLibraryService } from '../libraryService';

jest.mock('expo-file-system', () => require('@/test-utils/fakeFileSystem').fakeExpoFileSystem);
jest.mock('expo-sqlite', () => ({}));

const MUSIC = 'file:///sandbox/Documents/music/';
const ID = '11111111-2222-4333-8444-555555555555';
const ORPHAN = '99999999-2222-4333-8444-555555555555';

beforeEach(() => fakeFs.reset());

async function setup() {
  const repos = createRepositories(await createTestDb());
  return { repos, library: createLibraryService(repos) };
}

describe('libraryService.deleteSong', () => {
  it('removes the MP3, artwork, database row and playlist references', async () => {
    const { repos, library } = await setup();
    const song = await repos.songs.insert(
      makeSong({
        id: ID,
        localAudioUri: `${MUSIC}${ID}.mp3`,
        localArtworkUri: `${MUSIC}${ID}.jpg`,
      }),
    );
    fakeFs.writeFile(song.localAudioUri);
    fakeFs.writeFile(song.localArtworkUri!);
    const playlist = await repos.playlists.create({ name: 'Mix' });
    await repos.playlists.addSong(playlist.id, song.id);

    await library.deleteSong(song.id);

    expect(fakeFs.entries.has(song.localAudioUri)).toBe(false);
    expect(fakeFs.entries.has(song.localArtworkUri!)).toBe(false);
    expect(await repos.songs.getById(song.id)).toBeNull();
    expect(await repos.playlists.getSongs(playlist.id)).toEqual([]);
  });

  it('is a no-op for unknown songs', async () => {
    const { library } = await setup();
    await expect(library.deleteSong('missing')).resolves.toBeNull();
  });
});

describe('libraryService.cleanUpOrphans', () => {
  it('deletes files with no matching song', async () => {
    const { repos, library } = await setup();
    await repos.songs.insert(makeSong({ id: ID, localAudioUri: `${MUSIC}${ID}.mp3` }));
    fakeFs.writeFile(`${MUSIC}${ID}.mp3`);
    fakeFs.writeFile(`${MUSIC}${ORPHAN}.mp3`);
    expect(await library.cleanUpOrphans()).toEqual([`${ORPHAN}.mp3`]);
    expect(fakeFs.entries.has(`${MUSIC}${ID}.mp3`)).toBe(true);
  });
});
