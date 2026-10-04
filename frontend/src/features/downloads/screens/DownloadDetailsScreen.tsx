import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppText, Artwork, Button, EmptyState, Icon } from '@/components/ui';
import { getAudioService } from '@/services/audio/playbackService';
import { useDownloadStore } from '@/store/downloadStore';
import { useLibraryStore } from '@/store/libraryStore';
import { colors, radii, shadows, spacing } from '@/theme';
import type { DownloadStatus } from '@/types/models';
import { formatDuration } from '@/utils/format';

import { STATUS_LABEL, isActive, getDownloadManager } from '..';

const STEPS: DownloadStatus[] = [
  'validating',
  'preparing',
  'downloading',
  'processing',
  'saving',
  'completed',
];

/** Live progress for one import, with cancel / retry / play. */
export function DownloadDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useDownloadStore((s) => s.records[id]);
  const remove = useDownloadStore((s) => s.remove);
  const song = useLibraryStore((s) => s.songs.find((x) => x.id === record?.songId));

  if (!record) {
    return (
      <Screen>
        <EmptyState
          icon="cloud-download-outline"
          title="Download not found"
          message="It may have been cleared."
        />
      </Screen>
    );
  }

  const manager = getDownloadManager();
  const failed = record.status === 'failed';
  const active = isActive(record.status);
  const currentStep = STEPS.indexOf(record.status);

  return (
    <Screen>
      <View style={styles.hero}>
        <Artwork
          uri={record.metadata.thumbnail}
          size={180}
          radius={radii.lg}
          style={shadows.artwork}
        />
        <AppText variant="heading" style={styles.center}>
          {record.metadata.title}
        </AppText>
        <AppText tone="secondary">
          {record.metadata.creator} · {formatDuration(record.metadata.duration)}
        </AppText>
      </View>

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <AppText
            variant="bodyStrong"
            tone={failed ? 'danger' : 'primary'}
            accessibilityLiveRegion="polite"
          >
            {failed ? 'Download failed' : STATUS_LABEL[record.status]}
          </AppText>
          {!failed ? <AppText variant="bodyStrong">{record.progress}%</AppText> : null}
        </View>
        {!failed ? (
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: record.progress }}
          >
            <View style={[styles.fill, { width: `${record.progress}%` }]} />
          </View>
        ) : (
          <AppText tone="secondary">{record.errorMessage}</AppText>
        )}

        <View style={styles.steps}>
          {STEPS.slice(1).map((step, i) => {
            const reached = !failed && currentStep >= i + 1;
            const current = !failed && currentStep === i + 1;
            return (
              <View key={step} style={styles.step}>
                <Icon
                  name={
                    reached && !current
                      ? 'checkmark-circle'
                      : current
                        ? 'ellipse'
                        : 'ellipse-outline'
                  }
                  size={16}
                  color={reached ? colors.primary : colors.textMuted}
                />
                <AppText variant="caption" tone={reached ? 'primary' : 'muted'}>
                  {STATUS_LABEL[step]}
                </AppText>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.actions}>
        {record.status === 'completed' && song ? (
          <Button
            label="Play now"
            icon="play"
            onPress={() => {
              void getAudioService().playSong(song);
              router.push('/now-playing');
            }}
          />
        ) : null}
        {active ? (
          <>
            <AppText variant="caption" tone="muted" style={styles.center}>
              You can leave this screen. The download continues, and finishes when you come back if
              the app was in the background.
            </AppText>
            <Button
              label="Cancel download"
              variant="danger"
              onPress={() => void manager.cancel(record.id)}
            />
          </>
        ) : null}
        {failed ? (
          <>
            {record.errorCode !== 'duplicate' ? (
              <Button
                label="Try again"
                icon="refresh"
                onPress={() => void manager.retry(record.id)}
              />
            ) : null}
            <Button
              label="Remove from list"
              variant="ghost"
              onPress={() => {
                void manager.dismiss(record.id).then(() => remove(record.id));
                router.back();
              }}
            />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  center: { textAlign: 'center' },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  track: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: 6, backgroundColor: colors.primary },
  steps: { gap: spacing.sm, marginTop: spacing.xs },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { padding: spacing.xl, gap: spacing.md },
});
