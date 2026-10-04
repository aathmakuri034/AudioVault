import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Artwork, EmptyState, IconButton } from '@/components/ui';
import { getAudioService } from '@/services/audio/playbackService';
import { usePlayerStore } from '@/store/playerStore';
import { colors, spacing } from '@/theme';
import type { Song } from '@/types/models';
import { formatDuration } from '@/utils/format';

/** Now playing plus everything up next, with skip, reorder and remove. */
export function QueueScreen() {
  const audio = getAudioService();
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);

  if (queue.length === 0) {
    return (
      <View style={styles.root}>
        <EmptyState
          icon="list-outline"
          title="Queue is empty"
          message="Play a song or playlist to build a queue."
        />
      </View>
    );
  }

  const current = queue[queueIndex];
  const upNext = queue.slice(queueIndex + 1);
  const modeText = [shuffle && 'Shuffle on', repeat !== 'off' && `Repeat ${repeat}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <FlatList
      style={styles.root}
      data={upNext}
      keyExtractor={(song, i) => `${song.id}-${i}`}
      ListHeaderComponent={
        <View style={styles.header}>
          <AppText variant="micro" tone="secondary">
            NOW PLAYING
          </AppText>
          {current ? <QueueRow song={current} active /> : null}
          <View style={styles.upNextHeader}>
            <AppText variant="heading">Next up</AppText>
            {modeText ? (
              <AppText variant="caption" tone="accent">
                {modeText}
              </AppText>
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        <AppText tone="secondary" style={styles.empty}>
          Nothing queued after this track.
        </AppText>
      }
      renderItem={({ item, index }) => {
        const absolute = queueIndex + 1 + index;
        return (
          <QueueRow
            song={item}
            onPress={() => void audio.skipToQueueIndex(absolute)}
            onMoveUp={index > 0 ? () => audio.moveInQueue(absolute, absolute - 1) : undefined}
            onMoveDown={
              index < upNext.length - 1
                ? () => audio.moveInQueue(absolute, absolute + 1)
                : undefined
            }
            onRemove={() => void audio.removeFromQueue(absolute)}
          />
        );
      }}
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
    />
  );
}

function QueueRow({
  song,
  active,
  onPress,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  song: Song;
  active?: boolean;
  onPress?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${song.title} by ${song.creator}`}
      accessibilityHint={onPress ? 'Plays this song now' : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}
    >
      <Artwork uri={song.localArtworkUri} size={44} radius={6} />
      <View style={styles.rowText}>
        <AppText
          variant="bodyStrong"
          numberOfLines={1}
          style={active ? { color: colors.primary } : null}
        >
          {song.title}
        </AppText>
        <AppText variant="caption" tone="secondary" numberOfLines={1}>
          {song.creator} · {formatDuration(song.duration)}
        </AppText>
      </View>
      {onMoveUp || onMoveDown ? (
        <>
          <IconButton
            icon="chevron-up"
            label={`Move ${song.title} up`}
            size={18}
            color={colors.textSecondary}
            disabled={!onMoveUp}
            onPress={() => onMoveUp?.()}
          />
          <IconButton
            icon="chevron-down"
            label={`Move ${song.title} down`}
            size={18}
            color={colors.textSecondary}
            disabled={!onMoveDown}
            onPress={() => onMoveDown?.()}
          />
        </>
      ) : null}
      {onRemove ? (
        <IconButton
          icon="close"
          label={`Remove ${song.title} from queue`}
          size={18}
          color={colors.textSecondary}
          onPress={onRemove}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingTop: spacing.lg, gap: spacing.sm },
  upNextHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  empty: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  rowText: { flex: 1, gap: 2 },
});
