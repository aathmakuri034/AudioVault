import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NowPlayingPill } from '@/components/player/NowPlayingPill';
import { PlaylistRow } from '@/components/playlists/PlaylistRow';
import { SongActionsSheet } from '@/components/songs/SongActionsSheet';
import { SongRow } from '@/components/songs/SongRow';
import { useSongMenu } from '@/components/songs/useSongMenu';
import { AppText, Button, Chip, EmptyState, IconButton } from '@/components/ui';
import { getRepositories, type SongSort } from '@/services/database/repositories';
import { usePlaySong } from '@/features/player/usePlaySong';
import { useLibraryStore } from '@/store/libraryStore';
import { usePlayerStore } from '@/store/playerStore';
import { colors, spacing } from '@/theme';
import type { Playlist } from '@/types/models';
import { pluralize } from '@/utils/format';

import { loadSampleLibrary } from '../sampleLibrary';

type Segment = 'songs' | 'playlists';

const SORTS: { key: SongSort; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'title', label: 'Title' },
  { key: 'creator', label: 'Creator' },
];

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const songs = useLibraryStore((s) => s.songs);
  const playlists = useLibraryStore((s) => s.playlists);
  const sort = useLibraryStore((s) => s.sort);
  const setSort = useLibraryStore((s) => s.setSort);
  const refresh = useLibraryStore((s) => s.refresh);

  const [segment, setSegment] = useState<Segment>('songs');
  const menu = useSongMenu();
  const [seeding, setSeeding] = useState(false);

  const playSong = usePlaySong(songs);
  const activeId = usePlayerStore((s) => s.currentSong?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const openPlaylist = useCallback(
    (p: Playlist) => router.push({ pathname: '/playlist/[id]', params: { id: p.id } }),
    [],
  );

  const seedSamples = async () => {
    setSeeding(true);
    try {
      await loadSampleLibrary(await getRepositories());
      await refresh();
    } catch (error) {
      Alert.alert('Could not load samples', error instanceof Error ? error.message : String(error));
    } finally {
      setSeeding(false);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.titleRow}>
        <AppText variant="title" accessibilityRole="header">
          Your Library
        </AppText>
        <View style={styles.headerActions}>
          <NowPlayingPill />
          <IconButton
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push('/settings')}
          />
        </View>
      </View>
      <View style={styles.chips} accessibilityRole="tablist">
        <Chip label="Songs" selected={segment === 'songs'} onPress={() => setSegment('songs')} />
        <Chip
          label="Playlists"
          selected={segment === 'playlists'}
          onPress={() => setSegment('playlists')}
        />
      </View>
      {segment === 'songs' && songs.length > 0 ? (
        <View style={styles.sortRow}>
          <AppText variant="caption" tone="secondary">
            {pluralize(songs.length, 'song')} · Sort by
          </AppText>
          {SORTS.map(({ key, label }) => (
            <AppText
              key={key}
              variant="caption"
              tone={sort === key ? 'accent' : 'secondary'}
              onPress={() => void setSort(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: sort === key }}
              suppressHighlighting
            >
              {label}
            </AppText>
          ))}
        </View>
      ) : null}
    </View>
  );

  if (segment === 'playlists') {
    return (
      <FlatList
        style={styles.list}
        data={playlists}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <>
            {header}
            {playlists.length > 0 ? (
              <Button
                label="New playlist"
                icon="add"
                variant="secondary"
                style={styles.newPlaylist}
                onPress={() => router.push('/playlist/edit')}
              />
            ) : null}
          </>
        }
        renderItem={({ item }) => <PlaylistRow playlist={item} onPress={openPlaylist} />}
        ListEmptyComponent={
          <EmptyState
            icon="albums-outline"
            title="No playlists yet"
            message="Group your downloaded tracks into playlists that work offline."
            actionLabel="Create Playlist"
            onAction={() => router.push('/playlist/edit')}
          />
        }
      />
    );
  }

  return (
    <>
      <FlatList
        style={styles.list}
        data={songs}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <SongRow
            song={item}
            onPress={playSong}
            onMore={menu.open}
            isActive={item.id === activeId}
            isPlaying={isPlaying}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="musical-notes-outline"
            title="Your library is empty"
            message="Tracks you import appear here and play without an internet connection."
            actionLabel={
              __DEV__ ? (seeding ? 'Loading…' : 'Load sample library') : 'Import a track'
            }
            onAction={__DEV__ ? () => void seedSamples() : () => router.navigate('/')}
          />
        }
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chips: { flexDirection: 'row', gap: spacing.sm },
  newPlaylist: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
