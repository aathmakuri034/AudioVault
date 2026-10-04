import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppText, Artwork, Button, EmptyState, Icon } from '@/components/ui';
import { useDownloadStore } from '@/store/downloadStore';
import { colors, radii, shadows, spacing } from '@/theme';
import { formatDuration } from '@/utils/format';

import { CONSENT_TEXT } from '../components/ConsentModal';
import { DownloadError, getDownloadManager } from '..';

/** Confirmation step: shows the fetched metadata before any audio is processed. */
export function DownloadConfirmScreen() {
  const metadata = useDownloadStore((s) => s.pending);
  const consentAt = useDownloadStore((s) => s.consentAcknowledgedAt);
  const acknowledge = useDownloadStore((s) => s.acknowledgeConsent);
  const setPending = useDownloadStore((s) => s.setPending);
  // Pre-checked once the user has acknowledged before.
  const [confirmed, setConfirmed] = useState(consentAt != null);
  const [starting, setStarting] = useState(false);

  if (!metadata) {
    return (
      <Screen>
        <EmptyState
          icon="link-outline"
          title="Nothing to confirm"
          message="Paste a link on the Home screen to import audio."
        />
      </Screen>
    );
  }

  const start = async () => {
    if (!confirmed) return;
    setStarting(true);
    try {
      if (consentAt == null) await acknowledge();
      const record = await getDownloadManager().start(metadata);
      setPending(null);
      router.replace({ pathname: '/download/[id]', params: { id: record.id } });
    } catch (error) {
      const message =
        error instanceof DownloadError ? error.message : 'Unable to start this download.';
      Alert.alert('Can’t download', message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Artwork uri={metadata.thumbnail} size={220} radius={radii.lg} style={shadows.artwork} />
        <View style={styles.titles}>
          <AppText variant="title" style={styles.center}>
            {metadata.title}
          </AppText>
          <AppText tone="secondary" style={styles.center}>
            {metadata.creator} · {formatDuration(metadata.duration)}
          </AppText>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.info}>
          <Icon name="lock-closed-outline" size={18} color={colors.textSecondary} />
          <AppText variant="caption" tone="secondary" style={styles.flex}>
            Saved as MP3 in AudioVault’s private storage. It won’t appear in Files, Downloads or
            other music apps, and plays offline.
          </AppText>
        </View>

        <Pressable
          onPress={() => setConfirmed(!confirmed)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          style={styles.consent}
        >
          <Icon
            name={confirmed ? 'checkbox' : 'square-outline'}
            size={24}
            color={confirmed ? colors.primary : colors.textSecondary}
          />
          <AppText variant="body" style={styles.flex}>
            {CONSENT_TEXT}
          </AppText>
        </Pressable>

        <Button
          label="Download Audio"
          icon="cloud-download"
          disabled={!confirmed}
          loading={starting}
          onPress={() => void start()}
          accessibilityHint="Converts the audio to MP3 and saves it to your library"
        />
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.lg, padding: spacing.xl },
  titles: { gap: spacing.xs, alignItems: 'center' },
  center: { textAlign: 'center' },
  body: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  info: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  consent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  flex: { flex: 1 },
});
