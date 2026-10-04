import { createRepositories } from '@/services/database/repositories';
import { makeSong } from '@/test-utils/fixtures';
import { createTestDb } from '@/test-utils/sqliteTestDb';

import { searchLibrary } from '../searchLibrary';

jest.mock('expo-file-system', () => require('@/test-utils/fakeFileSystem').fakeExpoFileSystem);
jest.mock('expo-sqlite', () => ({}));

async function setup() {
  const repos = createRepositories(await createTestDb());
  await repos.songs.insert(makeSong({ title: 'Blinding Lights', creator: 'The Weeknd' }));
  await repos.songs.insert(makeSong({ title: 'Levitating', creator: 'Dua Lipa' }));
  await repos.songs.insert(makeSong({ title: '100% Pure', creator: 'Literal_Band' }));
  await repos.playlists.create({ name: 'Road Trip' });
  await repos.playlists.create({ name: 'Gym Mix' });
  return repos;
}

describe('searchLibrary', () => {
  it('finds songs by title', async () => {
    const { songs, playlists } = await searchLibrary(await setup(), 'blinding');
    expect(songs.map((s) => s.title)).toEqual(['Blinding Lights']);
    expect(playlists).toEqual([]);
  });

  it('finds songs by creator', async () => {
    const { songs } = await searchLibrary(await setup(), 'dua');
    expect(songs.map((s) => s.title)).toEqual(['Levitating']);
  });

  it('finds playlists by name', async () => {
    const { songs, playlists } = await searchLibrary(await setup(), 'road');
    expect(songs).toEqual([]);
    expect(playlists.map((p) => p.name)).toEqual(['Road Trip']);
  });

  it('is case-insensitive and trims the query', async () => {
    const repos = await setup();
    const { songs, playlists } = await searchLibrary(repos, '  GYM  ');
    expect(playlists.map((p) => p.name)).toEqual(['Gym Mix']);
    expect(songs).toEqual([]);
    expect((await searchLibrary(repos, 'LEVITATING')).songs).toHaveLength(1);
  });

  it('returns nothing for empty or whitespace queries without querying', async () => {
    const repos = await setup();
    const songSpy = jest.spyOn(repos.songs, 'search');
    const playlistSpy = jest.spyOn(repos.playlists, 'search');
    for (const q of ['', '   ', '\t\n']) {
      expect(await searchLibrary(repos, q)).toEqual({ songs: [], playlists: [] });
    }
    expect(songSpy).not.toHaveBeenCalled();
    expect(playlistSpy).not.toHaveBeenCalled();
  });

  it('returns the { songs, playlists } shape with hydrated models', async () => {
    const result = await searchLibrary(await setup(), 'r');
    expect(Object.keys(result).sort()).toEqual(['playlists', 'songs']);
    expect(result.songs[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), title: expect.any(String) }),
    );
    expect(result.playlists[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), name: expect.any(String) }),
    );
  });

  it('treats % and _ literally', async () => {
    const repos = await setup();
    expect((await searchLibrary(repos, '%')).songs.map((s) => s.title)).toEqual(['100% Pure']);
    expect((await searchLibrary(repos, '_')).songs.map((s) => s.creator)).toEqual(['Literal_Band']);
    expect((await searchLibrary(repos, 'L_t')).songs).toEqual([]);
  });

  it('passes the 50 song and 20 playlist limits', async () => {
    const repos = await setup();
    const songSpy = jest.spyOn(repos.songs, 'search');
    const playlistSpy = jest.spyOn(repos.playlists, 'search');
    await searchLibrary(repos, ' x ');
    expect(songSpy).toHaveBeenCalledWith('x', 50);
    expect(playlistSpy).toHaveBeenCalledWith('x', 20);
  });
});
