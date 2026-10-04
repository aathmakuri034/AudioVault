import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Screen } from '@/components/layout/Screen';
import { AppText, Button, TextField } from '@/components/ui';
import { loadSampleLibrary } from '@/features/library/sampleLibrary';
import { ApiError } from '@/services/api/client';
import { getApiClient, getApiConfig, saveApiConfig } from '@/services/api/config';
import { getRepositories } from '@/services/database/repositories';
import { getAvailableBytes } from '@/services/filesystem/musicStorage';
import { useDownloadStore } from '@/store/downloadStore';
import { useLibraryStore } from '@/store/libraryStore';
import { colors, radii, spacing } from '@/theme';
import { createId } from '@/utils/id';
import { formatBytes, formatDate, pluralize } from '@/utils/format';

const serverUrlSchema = z
  .string()
  .trim()
  .url('Enter a full address, e.g. http://192.168.1.20:8000')
  .refine((v) => /^https?:\/\//.test(v), 'Use http:// or https://');

export function SettingsScreen() {
  const songs = useLibraryStore((s) => s.songs);
  const refresh = useLibraryStore((s) => s.refresh);
  const consentAt = useDownloadStore((s) => s.consentAcknowledgedAt);
  const resetConsent = useDownloadStore((s) => s.resetConsent);

  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | 'samples' | null>(null);
  const [storageUsed, setStorageUsed] = useState<number | null>(null);

  useEffect(() => {
    void getApiConfig().then((config) => {
      setBaseUrl(config.baseUrl);
      setHasKey(!!config.apiKey);
    });
    void getRepositories()
      .then((repos) => repos.songs.totalStorageBytes())
      .then(setStorageUsed);
  }, [songs.length]);

  const save = async () => {
    const parsed = serverUrlSchema.safeParse(baseUrl);
    if (!parsed.success) {
      setUrlError(parsed.error.issues[0]?.message ?? 'Invalid address');
      return;
    }
    setBusy('save');
    try {
      await saveApiConfig({ baseUrl: parsed.data, apiKey: apiKey || undefined });
      if (apiKey) setHasKey(true);
      setApiKey('');
      Alert.alert('Saved', 'Server settings updated.');
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    const api = getApiClient();
    try {
      const health = await api.health();
      try {
        // A random job id: 404 proves the API key was accepted, 401 that it wasn't.
        await api.getJob(createId());
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== 'job_not_found') throw e;
      }
      Alert.alert('Connected', `Server is reachable. Providers: ${health.providers.join(', ')}.`);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Unable to reach the server.';
      Alert.alert('Connection failed', message);
    } finally {
      setBusy(null);
    }
  };

  const seed = async () => {
    setBusy('samples');
    try {
      const added = await loadSampleLibrary(await getRepositories());
      await refresh();
      Alert.alert(
        'Sample library',
        added ? `Added ${pluralize(added, 'track')}.` : 'Already loaded.',
      );
    } catch (e) {
      Alert.alert('Could not load samples', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <Section title="Media server">
        <AppText variant="caption" tone="secondary">
          The AudioVault backend that converts imports to MP3. On a phone, use your computer’s LAN
          address, not localhost.
        </AppText>
        <TextField
          label="Server address"
          value={baseUrl}
          onChangeText={(t) => {
            setBaseUrl(t);
            setUrlError(null);
          }}
          placeholder="http://192.168.1.20:8000"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={urlError}
        />
        <TextField
          label={hasKey ? 'API key (saved — enter to replace)' : 'API key'}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder={hasKey ? '••••••••••••' : 'Paste the API_KEY from backend/.env'}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <View style={styles.row}>
          <Button
            label="Save"
            onPress={() => void save()}
            loading={busy === 'save'}
            style={styles.flex}
          />
          <Button
            label="Test connection"
            variant="secondary"
            onPress={() => void test()}
            loading={busy === 'test'}
            style={styles.flex}
          />
        </View>
        <AppText variant="micro" tone="muted">
          The API key is stored in the device keychain.
        </AppText>
      </Section>

      <Section title="Storage">
        <Row label="Downloaded songs" value={pluralize(songs.length, 'song')} />
        <Row label="Space used" value={formatBytes(storageUsed)} />
        <Row label="Free on device" value={formatBytes(getAvailableBytes())} />
        <AppText variant="caption" tone="secondary">
          Music is stored privately inside AudioVault and is not visible in Files, Downloads or
          other music apps.
        </AppText>
      </Section>

      <Section title="Content rights">
        <Row
          label="Download acknowledgement"
          value={consentAt ? `Accepted ${formatDate(consentAt)}` : 'Not yet accepted'}
        />
        <AppText variant="caption" tone="secondary">
          Only import content you own or have permission to download and store.
        </AppText>
        {consentAt ? (
          <Button
            label="Ask again before next download"
            variant="ghost"
            onPress={() => void resetConsent()}
          />
        ) : null}
      </Section>

      {__DEV__ ? (
        <Section title="Developer">
          <Button
            label="Load sample library"
            variant="secondary"
            icon="flask-outline"
            loading={busy === 'samples'}
            onPress={() => void seed()}
          />
        </Section>
      ) : null}

      <Section title="About">
        <Row label="Version" value={Constants.expoConfig?.version ?? '1.0.0'} />
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText
        variant="micro"
        tone="secondary"
        accessibilityRole="header"
        style={styles.sectionTitle}
      >
        {title.toUpperCase()}
      </AppText>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <AppText tone="secondary">{label}</AppText>
      <AppText>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.sm },
  sectionTitle: { letterSpacing: 1.2, marginLeft: spacing.xs },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
});
