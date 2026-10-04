import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AppText } from '@/components/ui';
import { usePlayerStore } from '@/store/playerStore';
import { colors, radii, spacing, TOUCH_TARGET } from '@/theme';

import { Equalizer } from './Equalizer';

/**
 * Compact header entry point to the Now Playing screen. Shown only while a
 * track is loaded; this is navigation, not a persistent mini-player.
 */
export function NowPlayingPill() {
  const song = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  if (!song) return null;

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
      <Pressable
        onPress={() => router.push('/now-playing')}
        accessibilityRole="button"
        accessibilityLabel={`Now playing: ${song.title}. Open player`}
        hitSlop={6}
        style={({ pressed }) => [
          styles.pill,
          pressed && { backgroundColor: colors.elevatedPressed },
        ]}
      >
        <Equalizer active={isPlaying} />
        <AppText variant="micro" numberOfLines={1} style={styles.label}>
          {song.title}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET - 8,
    maxWidth: 170,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { flexShrink: 1 },
});
