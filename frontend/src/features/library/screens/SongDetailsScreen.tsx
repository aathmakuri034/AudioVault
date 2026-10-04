import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppText, Artwork, EmptyState } from '@/components/ui';
import { useLibraryStore } from '@/store/libraryStore';
import { colors, radii, shadows, spacing } from '@/theme';
import { formatBytes, formatDate, formatDuration } from '@/utils/format';

const PROVIDER_LABEL: Record<string, string> = { youtube: 'YouTube', sample: 'Bundled sample' };

export function SongDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const song = useLibraryStore((s) => s.songs.find((x) => x.id === id));

  if (!song) {
    return (
      <Screen>
        <EmptyState
          icon="musical-note"
          title="Song not found"
          message="It may have been deleted."
        />
      </Screen>
    );
  }

  const rows: [string, string][] = [
    ['Creator', song.creator],
    ['Duration', formatDuration(song.duration)],
    ['Source', PROVIDER_LABEL[song.provider] ?? song.provider],
    ['Downloaded', formatDate(song.dateDownloaded)],
    ['File size', formatBytes(song.fileSize)],
    ['Plays', String(song.playCount)],
    ['Last played', formatDate(song.lastPlayed)],
    ['Favorite', song.isFavorite ? 'Yes' : 'No'],
    ['Storage', 'Private app storage · available offline'],
  ];

  return (
    <Screen>
      <View style={styles.hero}>
        <Artwork uri={song.localArtworkUri} size={200} radius={radii.lg} style={shadows.artwork} />
        <AppText variant="title" style={styles.center} selectable>
          {song.title}
        </AppText>
      </View>
      <View style={styles.card}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <AppText variant="caption" tone="secondary">
              {label}
            </AppText>
            <AppText variant="body" style={styles.value} selectable>
              {value}
            </AppText>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.lg, padding: spacing.xl },
  center: { textAlign: 'center' },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  value: { flexShrink: 1, textAlign: 'right' },
});
