import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/layout/Screen';
import { NowPlayingPill } from '@/components/player/NowPlayingPill';
import { MediaCard } from '@/components/songs/MediaCard';
import { AppText, Button, EmptyState, IconButton, SectionHeader, TextField } from '@/components/ui';
import { DownloadError, getDownloadManager } from '@/features/downloads';
import { ConsentModal } from '@/features/downloads/components/ConsentModal';
import { DownloadRow } from '@/features/downloads/components/DownloadRow';
import { usePlaySong } from '@/features/player/usePlaySong';
import { sortRecords, useDownloadStore } from '@/store/downloadStore';
import { useLibraryStore } from '@/store/libraryStore';
import { usePlayerStore } from '@/store/playerStore';
import { colors, radii, spacing } from '@/theme';
import type { Song } from '@/types/models';
import { pluralize } from '@/utils/format';

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentVisible, setConsentVisible] = useState(false);

  const songs = useLibraryStore((s) => s.songs);
  const recentlyPlayed = useLibraryStore((s) => s.recentlyPlayed);
  const recentlyDownloaded = useLibraryStore((s) => s.recentlyDownloaded);
  const favorites = useLibraryStore((s) => s.favorites);
  const playlists = useLibraryStore((s) => s.playlists);
  const records = useDownloadStore((s) => s.records);
  const consentAt = useDownloadStore((s) => s.consentAcknowledgedAt);
  const acknowledge = useDownloadStore((s) => s.acknowledgeConsent);
  const setPending = useDownloadStore((s) => s.setPending);
  const activeId = usePlayerStore((s) => s.currentSong?.id);

  // Show in-flight imports plus failures the user hasn't dismissed.
  const visibleDownloads = useMemo(
    () =>
      sortRecords(records)
        .filter((r) => r.status !== 'completed')
        .slice(0, 5),
    [records],
  );

  const lookUp = async () => {
    Keyboard.dismiss();
    setError(null);
    setChecking(true);
    try {
      const metadata = await getDownloadManager().prepare(url);
      setPending(metadata);
      setUrl('');
      router.push('/download/confirm');
    } catch (e) {
      setError(e instanceof DownloadError ? e.message : 'Unable to process this URL.');
    } finally {
      setChecking(false);
    }
  };

  const onDownloadPress = () => {
    if (consentAt == null) setConsentVisible(true);
    else void lookUp();
  };

  const libraryEmpty = songs.length === 0;

  return (
    <Screen padTop keyboardShouldPersistTaps="handled">
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.logo}
            accessibilityIgnoresInvertColors
          />
          <AppText variant="title" accessibilityRole="header">
            AudioVault
          </AppText>
        </View>
        <View style={styles.topActions}>
          <NowPlayingPill />
          <IconButton
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push('/settings')}
          />
        </View>
      </View>

      <View style={styles.importCard}>
        <AppText variant="heading">Import audio</AppText>
        <AppText variant="caption" tone="secondary">
          Paste a link to media you own or have permission to download.
        </AppText>
        <TextField
          icon="link"
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            setError(null);
          }}
          placeholder="https://www.youtube.com/watch?v=…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          returnKeyType="go"
          onSubmitEditing={onDownloadPress}
          error={error}
          accessibilityLabel="Media link"
        />
        <Button
          label={checking ? 'Checking link…' : 'Download Audio'}
          icon="cloud-download"
          loading={checking}
          disabled={!url.trim()}
          onPress={onDownloadPress}
        />
      </View>

      {visibleDownloads.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Downloads" />
          {visibleDownloads.map((r) => (
            <DownloadRow
              key={r.id}
              record={r}
              onPress={(rec) => router.push({ pathname: '/download/[id]', params: { id: rec.id } })}
            />
          ))}
        </View>
      ) : null}

      {libraryEmpty ? (
        <EmptyState
          icon="musical-notes"
          title="Start your offline library"
          message="Import your first authorized track above. It’s saved privately on this device and plays without a connection."
        />
      ) : (
        <>
          <Shelf title="Recently Played" songs={recentlyPlayed} activeId={activeId} />
          <Shelf title="Recently Downloaded" songs={recentlyDownloaded} activeId={activeId} />
          <Shelf title="Favorite Songs" songs={favorites} activeId={activeId} />
          <View style={styles.section}>
            <SectionHeader
              title="Playlists"
              actionLabel={playlists.length > 0 ? 'See all' : undefined}
              onAction={() => router.navigate('/library')}
            />
            {playlists.length === 0 ? (
              <View style={styles.inlineEmpty}>
                <AppText tone="secondary">Group tracks into playlists that work offline.</AppText>
                <Button
                  label="Create playlist"
                  icon="add"
                  variant="secondary"
                  onPress={() => router.push('/playlist/edit')}
                />
              </View>
            ) : (
              <FlatList
                horizontal
                data={playlists}
                keyExtractor={(p) => p.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.shelf}
                renderItem={({ item }) => (
                  <MediaCard
                    title={item.name}
                    subtitle={pluralize(item.songCount, 'song')}
                    artworkUri={item.artworkUri}
                    placeholderIcon="albums"
                    onPress={() =>
                      router.push({ pathname: '/playlist/[id]', params: { id: item.id } })
                    }
                  />
                )}
              />
            )}
          </View>
        </>
      )}

      <ConsentModal
        visible={consentVisible}
        onCancel={() => setConsentVisible(false)}
        onConfirm={() => {
          setConsentVisible(false);
          void acknowledge().then(lookUp);
        }}
      />
      <View style={{ height: insets.bottom }} />
    </Screen>
  );
}

function Shelf({ title, songs, activeId }: { title: string; songs: Song[]; activeId?: string }) {
  const play = usePlaySong(songs);
  if (songs.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <FlatList
        horizontal
        data={songs}
        keyExtractor={(s) => s.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shelf}
        renderItem={({ item }) => (
          <MediaCard
            title={item.title}
            subtitle={item.creator}
            artworkUri={item.localArtworkUri}
            highlighted={item.id === activeId}
            onPress={() => play(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: { width: 34, height: 34, borderRadius: radii.sm },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  importCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
  },
  section: { marginTop: spacing.xl },
  shelf: { paddingHorizontal: spacing.lg, gap: spacing.md },
  inlineEmpty: { paddingHorizontal: spacing.lg, gap: spacing.md, alignItems: 'flex-start' },
});
