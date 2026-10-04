import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NowPlayingPill } from '@/components/player/NowPlayingPill';
import { PlaylistRow } from '@/components/playlists/PlaylistRow';
import { SongActionsSheet } from '@/components/songs/SongActionsSheet';
import { SongRow } from '@/components/songs/SongRow';
import { useSongMenu } from '@/components/songs/useSongMenu';
import { AppText, EmptyState, TextField } from '@/components/ui';
import { usePlaySong } from '@/features/player/usePlaySong';
import { usePlayerStore } from '@/store/playerStore';
import { colors, spacing } from '@/theme';
import type { Playlist, Song } from '@/types/models';

import { useLibrarySearch } from '../useLibrarySearch';

type Section =
  | { key: 'songs'; title: string; data: Song[] }
  | { key: 'playlists'; title: string; data: Playlist[] };

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const { term, results, error, libraryIsEmpty } = useLibrarySearch(query);
  const menu = useSongMenu();
  const playSong = usePlaySong(results.songs);
  const activeId = usePlayerStore((s) => s.currentSong?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const openPlaylist = useCallback(
    (p: Playlist) => router.push({ pathname: '/playlist/[id]', params: { id: p.id } }),
    [],
  );

  const sections = useMemo(() => {
    const out: Section[] = [];
    if (results.songs.length > 0) out.push({ key: 'songs', title: 'Songs', data: results.songs });
    if (results.playlists.length > 0) {
      out.push({ key: 'playlists', title: 'Playlists', data: results.playlists });
    }
    return out;
  }, [results]);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.titleRow}>
        <AppText variant="title" accessibilityRole="header">
          Search
        </AppText>
        <NowPlayingPill />
      </View>
      <TextField
        icon="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Songs, creators or playlists"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );

  let empty;
  if (error) {
    empty = <EmptyState icon="alert-circle-outline" title="Something went wrong" message={error} />;
  } else if (!term) {
    empty = libraryIsEmpty ? (
      <EmptyState
        icon="search"
        title="Your library is empty"
        message="Download or import tracks first, then search them here without a connection."
      />
    ) : (
      <EmptyState
        icon="search"
        title="Search your offline library"
        message="Find downloaded songs by title or creator, and playlists by name."
      />
    );
  } else {
    empty = (
      <EmptyState
        icon="search"
        title="No results"
        message={`Nothing in your library matches “${term}”.`}
      />
    );
  }

  return (
    <>
      <SectionList<Song | Playlist, Section>
        style={styles.list}
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <AppText variant="heading" accessibilityRole="header" style={styles.sectionHeader}>
            {section.title}
          </AppText>
        )}
        renderItem={({ item, section }) =>
          section.key === 'songs' ? (
            <SongRow
              song={item as Song}
              onPress={playSong}
              onMore={menu.open}
              isActive={item.id === activeId}
              isPlaying={isPlaying}
            />
          ) : (
            <PlaylistRow playlist={item as Playlist} onPress={openPlaylist} />
          )
        }
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      />
      <SongActionsSheet {...menu.sheetProps} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
});
