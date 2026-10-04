import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Artwork, BottomSheet, SheetAction } from '@/components/ui';
import { useLibraryStore } from '@/store/libraryStore';
import { colors, spacing } from '@/theme';
import type { Song } from '@/types/models';

export type SongActionsSheetProps = {
  song: Song | null;
  onClose: () => void;
  /** When shown inside a playlist, offers "Remove from playlist". */
  onRemoveFromPlaylist?: (song: Song) => void;
};

/** The three-dot menu for a song. All song actions live here so every list behaves the same. */
export function SongActionsSheet({ song, onClose, onRemoveFromPlaylist }: SongActionsSheetProps) {
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const deleteSong = useLibraryStore((s) => s.deleteSong);

  if (!song) return null;

  const run = (action: () => void) => () => {
    onClose();
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

  return (
    <BottomSheet
      visible
      onClose={onClose}
      header={
        <View style={styles.header}>
          <Artwork uri={song.localArtworkUri} size={48} radius={6} />
          <View style={styles.headerText}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {song.title}
            </AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {song.creator}
            </AppText>
          </View>
        </View>
      }
    >
      <SheetAction
        icon={song.isFavorite ? 'heart' : 'heart-outline'}
        label={song.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
        onPress={run(() => void toggleFavorite(song.id))}
      />
      {onRemoveFromPlaylist ? (
        <SheetAction
          icon="remove-circle-outline"
          label="Remove from this playlist"
          onPress={run(() => onRemoveFromPlaylist(song))}
        />
      ) : null}
      <SheetAction
        icon="information-circle-outline"
        label="Song details"
        onPress={run(() => router.push({ pathname: '/song/[id]', params: { id: song.id } }))}
      />
      <SheetAction
        icon="trash-outline"
        label="Delete from library"
        destructive
        onPress={run(confirmDelete)}
      />
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
});
