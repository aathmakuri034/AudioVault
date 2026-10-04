import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Artwork, BottomSheet, SheetAction } from '@/components/ui';
import { addSongToPlaylist } from '@/features/playlists/playlistActions';
import { getAudioService } from '@/services/audio/playbackService';
import { useLibraryStore } from '@/store/libraryStore';
import { colors, spacing } from '@/theme';
import type { Song } from '@/types/models';

export type SongActionsSheetProps = {
  song: Song | null;
  visible: boolean;
  onClose: () => void;
  onDismissed: () => void;
  /** When shown inside a playlist, offers "Remove from this playlist". */
  onRemoveFromPlaylist?: (song: Song) => void;
};

/**
 * The three-dot menu for a song. Every song list uses this so actions behave
 * identically everywhere. Follow-up UI runs after the sheet has dismissed.
 */
export function SongActionsSheet({
  song,
  visible,
  onClose,
  onDismissed,
  onRemoveFromPlaylist,
}: SongActionsSheetProps) {
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const deleteSong = useLibraryStore((s) => s.deleteSong);
  const playlists = useLibraryStore((s) => s.playlists);
  const [view, setView] = useState<'actions' | 'playlists'>('actions');
  const [pending, setPending] = useState<(() => void) | null>(null);

  if (!song) return null;

  const handleDismissed = () => {
    setView('actions');
    setPending(null);
    onDismissed();
    pending?.();
  };

  /** Close the sheet, then run `action` once it has fully dismissed. */
  const after = (action: () => void) => () => {
    onClose();
    if (Platform.OS === 'ios') {
      setPending(() => action);
      return;
    }
    // Android Modals have no onDismiss callback; run right away.
    setView('actions');
    onDismissed();
    action();
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete from library?',
      `“${song.title}” will be removed from this device and from all playlists.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSong(song.id).catch(() =>
              Alert.alert('Delete failed', 'The song could not be deleted. Try again.'),
            );
          },
        },
      ],
    );

  const addTo = (playlistId: string, name: string) => async () => {
    try {
      const added = await addSongToPlaylist(playlistId, song.id);
      if (!added) Alert.alert('Already added', `“${song.title}” is already in ${name}.`);
    } catch {
      Alert.alert('Could not add song', 'Please try again.');
    }
  };

  const audio = getAudioService();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onDismissed={handleDismissed}
      header={
        <View style={styles.header}>
          <Artwork uri={song.localArtworkUri} size={48} radius={6} />
          <View style={styles.headerText}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {view === 'playlists' ? 'Add to playlist' : song.title}
            </AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {view === 'playlists' ? song.title : song.creator}
            </AppText>
          </View>
        </View>
      }
    >
      {view === 'playlists' ? (
        <>
          <SheetAction
            icon="add-circle-outline"
            label="New playlist"
            onPress={after(() =>
              router.push({ pathname: '/playlist/edit', params: { addSongId: song.id } }),
            )}
          />
          <ScrollView style={styles.list}>
            {playlists.map((p) => (
              <SheetAction
                key={p.id}
                icon="albums-outline"
                label={p.name}
                onPress={after(() => void addTo(p.id, p.name)())}
              />
            ))}
          </ScrollView>
        </>
      ) : (
        <>
          <SheetAction
            icon="play-circle-outline"
            label="Play next"
            onPress={after(() => audio.playNext(song))}
          />
          <SheetAction
            icon="list-outline"
            label="Add to queue"
            onPress={after(() => audio.addToQueue(song))}
          />
          <SheetAction
            icon="add-outline"
            label="Add to playlist"
            onPress={() => setView('playlists')}
          />
          {onRemoveFromPlaylist ? (
            <SheetAction
              icon="remove-circle-outline"
              label="Remove from this playlist"
              onPress={after(() => onRemoveFromPlaylist(song))}
            />
          ) : null}
          <SheetAction
            icon={song.isFavorite ? 'heart' : 'heart-outline'}
            label={song.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
            onPress={after(() => void toggleFavorite(song.id))}
          />
          <SheetAction
            icon="information-circle-outline"
            label="Song details"
            onPress={after(() => router.push({ pathname: '/song/[id]', params: { id: song.id } }))}
          />
          <SheetAction
            icon="trash-outline"
            label="Delete from library"
            destructive
            onPress={after(confirmDelete)}
          />
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    marginBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1, gap: 2 },
  list: { maxHeight: 320 },
});
