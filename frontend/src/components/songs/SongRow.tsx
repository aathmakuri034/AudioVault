import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Artwork, Icon, IconButton } from '@/components/ui';
import { colors, spacing } from '@/theme';
import type { Song } from '@/types/models';
import { formatDuration } from '@/utils/format';

export type SongRowProps = {
  song: Song;
  onPress: (song: Song) => void;
  onMore: (song: Song) => void;
  /** Highlights the row as the active track. */
  isActive?: boolean;
  isPlaying?: boolean;
  /** Optional leading index, e.g. playlist position. */
  index?: number;
};

function SongRowBase({ song, onPress, onMore, isActive, isPlaying, index }: SongRowProps) {
  return (
    <Pressable
      onPress={() => onPress(song)}
      accessibilityRole="button"
      accessibilityLabel={`${song.title} by ${song.creator}`}
      accessibilityHint={isActive ? 'Opens Now Playing' : 'Plays this song'}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {index != null ? (
        <AppText variant="caption" tone="muted" style={styles.index}>
          {index + 1}
        </AppText>
      ) : null}
      <Artwork uri={song.localArtworkUri} size={52} radius={8} />
      <View style={styles.text}>
        <AppText
          variant="bodyStrong"
          numberOfLines={1}
          style={isActive ? { color: colors.primary } : null}
        >
          {song.title}
        </AppText>
        <View style={styles.meta}>
          <Icon name="arrow-down-circle" size={14} color={colors.primary} />
          {song.isFavorite ? <Icon name="heart" size={13} color={colors.textSecondary} /> : null}
          <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.creator}>
            {song.creator} · {formatDuration(song.duration)}
          </AppText>
        </View>
      </View>
      {isActive ? (
        <Icon name={isPlaying ? 'volume-high' : 'pause'} size={18} color={colors.primary} />
      ) : null}
      <IconButton
        icon="ellipsis-vertical"
        label={`More options for ${song.title}`}
        size={20}
        color={colors.textSecondary}
        onPress={() => onMore(song)}
      />
    </Pressable>
  );
}

export const SongRow = memo(SongRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
  },
  pressed: { backgroundColor: colors.card },
  index: { width: 20, textAlign: 'center' },
  text: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  creator: { flexShrink: 1 },
});
