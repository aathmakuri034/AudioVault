import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { NowPlayingPill } from '@/components/player/NowPlayingPill';
import { SongActionsSheet } from '@/components/songs/SongActionsSheet';
import { SongRow } from '@/components/songs/SongRow';
import { useSongMenu } from '@/components/songs/useSongMenu';
import { AppText, Artwork, Button, EmptyState, IconButton } from '@/components/ui';
import { usePlaySong } from '@/features/player/usePlaySong';
import { getAudioService } from '@/services/audio/playbackService';
import { usePlayerStore } from '@/store/playerStore';
import { colors, radii, shadows, spacing } from '@/theme';
import { formatDuration, pluralize } from '@/utils/format';

import { deletePlaylist, moveSongInPlaylist, removeSongFromPlaylist } from '../playlistActions';
import { usePlaylist } from '../usePlaylist';

export function PlaylistDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { playlist, songs, loaded } = usePlaylist(id);
  const playSong = usePlaySong(songs);
  const activeId = usePlayerStore((s) => s.currentSong?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const menu = useSongMenu();
  const [editing, setEditing] = useState(false);

  if (!playlist) {
    return (
      <View style={styles.root}>
        {loaded ? (
          <EmptyState
            icon="albums-outline"
            title="Playlist not found"
            message="It may have been deleted."
          />
        ) : null}
      </View>
    );
  }

  const totalSeconds = songs.reduce((sum, s) => sum + (s.duration ?? 0), 0);

  const confirmDelete = () =>
    Alert.alert(
      'Delete playlist?',
      `“${playlist.name}” will be deleted. Songs stay in your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            router.back();
            void deletePlaylist(playlist.id);
          },
        },
      ],
    );

  const showOptions = () =>
    Alert.alert(playlist.name, undefined, [
      {
        text: 'Edit details',
        onPress: () => router.push({ pathname: '/playlist/edit', params: { id: playlist.id } }),
      },
      {
        text: editing ? 'Done reordering' : 'Reorder / remove songs',
        onPress: () => setEditing(!editing),
      },
      { text: 'Delete playlist', style: 'destructive', onPress: confirmDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const header = (
    <View style={styles.header}>
      <Artwork
        uri={playlist.artworkUri}
        size={200}
        radius={radii.lg}
        placeholderIcon="albums"
        style={shadows.artwork}
      />
      <View style={styles.headerText}>
        <AppText variant="title" style={styles.center}>
          {playlist.name}
        </AppText>
        {playlist.description ? (
          <AppText tone="secondary" style={styles.center}>
            {playlist.description}
          </AppText>
        ) : null}
        <AppText variant="caption" tone="muted">
          {pluralize(songs.length, 'song')} · {formatDuration(totalSeconds)} · Available offline
        </AppText>
      </View>
      {songs.length > 0 ? (
        <View style={styles.actions}>
          <Button
            label="Play"
            icon="play"
            style={styles.action}
            onPress={() => void getAudioService().playSongs(songs, 0, { shuffle: false })}
          />
          <Button
            label="Shuffle"
            icon="shuffle"
            variant="secondary"
            style={styles.action}
            onPress={() =>
              void getAudioService().playSongs(songs, Math.floor(Math.random() * songs.length), {
                shuffle: true,
              })
            }
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={styles.headerRight}>
              <NowPlayingPill />
              <IconButton
                icon="ellipsis-horizontal"
                label="Playlist options"
                onPress={showOptions}
              />
            </View>
          ),
        }}
      />
      <FlatList
        style={styles.root}
        data={songs}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon="musical-notes-outline"
            title="No songs yet"
            message="Use a song's ⋮ menu and choose “Add to playlist”."
            actionLabel="Browse library"
            onAction={() => router.navigate('/library')}
          />
        }
        renderItem={({ item, index }) =>
          editing ? (
            <View style={styles.editRow}>
              <View style={styles.flex}>
                <SongRow song={item} index={index} onPress={() => undefined} onMore={menu.open} />
              </View>
              <IconButton
                icon="chevron-up"
                label={`Move ${item.title} up`}
                size={18}
                disabled={index === 0}
                onPress={() => void moveSongInPlaylist(playlist.id, index, index - 1)}
              />
              <IconButton
                icon="chevron-down"
                label={`Move ${item.title} down`}
                size={18}
                disabled={index === songs.length - 1}
                onPress={() => void moveSongInPlaylist(playlist.id, index, index + 1)}
              />
              <IconButton
                icon="remove-circle"
                label={`Remove ${item.title} from playlist`}
                color={colors.danger}
                size={20}
                onPress={() => void removeSongFromPlaylist(playlist.id, item.id)}
              />
            </View>
          ) : (
            <SongRow
              song={item}
              index={index}
              onPress={playSong}
              onMore={menu.open}
              isActive={item.id === activeId}
              isPlaying={isPlaying}
            />
          )
        }
        ListFooterComponent={
          editing ? (
            <Button
              label="Done"
              variant="secondary"
              style={styles.done}
              onPress={() => setEditing(false)}
            />
          ) : null
        }
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      />
      <SongActionsSheet
        {...menu.sheetProps}
        onRemoveFromPlaylist={(song) => void removeSongFromPlaylist(playlist.id, song.id)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { alignItems: 'center', gap: spacing.lg, padding: spacing.xl },
  headerText: { alignItems: 'center', gap: spacing.xs },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch' },
  action: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  editRow: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.sm },
  flex: { flex: 1 },
  done: { margin: spacing.xl },
});
