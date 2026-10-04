import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SongActionsSheet } from '@/components/songs/SongActionsSheet';
import { AppText, Artwork, EmptyState, IconButton } from '@/components/ui';
import { useLibraryStore } from '@/store/libraryStore';
import { usePlayerStore } from '@/store/playerStore';
import { colors, radii, shadows, spacing } from '@/theme';

import { PlayerControls } from '../components/PlayerControls';
import { ProgressBar } from '../components/ProgressBar';

/**
 * Full-screen player. It reads the shared player store, so opening it while
 * a track is already playing (including after returning from the background)
 * reflects the live state instead of restarting anything.
 */
export function NowPlayingScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const song = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const error = usePlayerStore((s) => s.error);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  // The library copy has the freshest favorite flag.
  const librarySong = useLibraryStore((s) => s.songs.find((x) => x.id === song?.id));
  const [menuOpen, setMenuOpen] = useState(false);

  const artSize = Math.min(width - spacing.xl * 2, 380);
  // Artwork eases back slightly while paused.
  const artScale = useSharedValue(isPlaying ? 1 : 0.88);
  useEffect(() => {
    artScale.set(withSpring(isPlaying ? 1 : 0.88, { damping: 14, stiffness: 120 }));
  }, [isPlaying, artScale]);
  const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: artScale.get() }] }));

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!song) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <IconButton icon="chevron-down" label="Close player" onPress={close} />
        <EmptyState
          icon="musical-notes-outline"
          title="Nothing playing"
          message="Pick a song from your library to start listening."
        />
      </View>
    );
  }

  const favorite = librarySong?.isFavorite ?? song.isFavorite;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#3A0D0D', colors.background]}
        locations={[0, 0.65]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        <View style={styles.topBar}>
          <IconButton icon="chevron-down" label="Close player" onPress={close} />
          <AppText variant="micro" tone="secondary" style={styles.topLabel}>
            NOW PLAYING
          </AppText>
          <IconButton
            icon="ellipsis-horizontal"
            label="More options"
            onPress={() => setMenuOpen(true)}
          />
        </View>

        <Animated.View entering={FadeIn.duration(250)} style={[styles.artWrap, artStyle]}>
          <Artwork
            uri={song.localArtworkUri}
            size={artSize}
            radius={radii.lg}
            style={shadows.artwork}
          />
        </Animated.View>

        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <AppText variant="title" numberOfLines={2}>
              {song.title}
            </AppText>
            <AppText variant="body" tone="secondary" numberOfLines={1}>
              {song.creator}
            </AppText>
          </View>
          <IconButton
            icon={favorite ? 'heart' : 'heart-outline'}
            label={favorite ? 'Remove from Favorites' : 'Add to Favorites'}
            color={favorite ? colors.primary : colors.textPrimary}
            size={26}
            onPress={() => void toggleFavorite(song.id)}
          />
        </View>

        {error ? (
          <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}

        <ProgressBar />
        <PlayerControls />
      </View>
      {menuOpen && librarySong ? (
        <SongActionsSheet song={librarySong} onClose={() => setMenuOpen(false)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
    justifyContent: 'space-between',
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topLabel: { letterSpacing: 1.5 },
  artWrap: { alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleText: { flex: 1, gap: spacing.xs },
});
