import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Artwork, Icon } from '@/components/ui';
import { colors, spacing } from '@/theme';
import type { Playlist } from '@/types/models';
import { pluralize } from '@/utils/format';

function PlaylistRowBase({
  playlist,
  onPress,
}: {
  playlist: Playlist;
  onPress: (playlist: Playlist) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(playlist)}
      accessibilityRole="button"
      accessibilityLabel={`Playlist ${playlist.name}, ${pluralize(playlist.songCount, 'song')}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}
    >
      <Artwork uri={playlist.artworkUri} size={56} radius={8} placeholderIcon="albums" />
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {playlist.name}
        </AppText>
        <AppText variant="caption" tone="secondary">
          Playlist · {pluralize(playlist.songCount, 'song')}
        </AppText>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export const PlaylistRow = memo(PlaylistRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1, gap: 3 },
});
