import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui';
import { getAudioService } from '@/services/audio/playbackService';
import { usePlayerStore } from '@/store/playerStore';
import { colors, spacing } from '@/theme';

const SKIP_SECONDS = 15;

const tap = () => void Haptics.selectionAsync().catch(() => undefined);

export function PlayerControls() {
  const audio = getAudioService();
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const canGoNext = usePlayerStore((s) => s.canGoNext);

  const repeatLabel =
    repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat playlist' : 'Repeat off';

  return (
    <View style={styles.wrapper}>
      <View style={styles.mainRow}>
        <IconButton
          icon="shuffle"
          label={shuffle ? 'Shuffle on' : 'Shuffle off'}
          color={shuffle ? colors.primary : colors.textSecondary}
          onPress={() => {
            tap();
            audio.toggleShuffle();
          }}
        />
        <IconButton
          icon="play-skip-back"
          label="Previous"
          size={32}
          onPress={() => void audio.previous()}
        />
        <IconButton
          icon={isPlaying ? 'pause' : 'play'}
          label={isPlaying ? 'Pause' : 'Play'}
          size={34}
          filled
          onPress={() => {
            tap();
            audio.togglePlayPause();
          }}
        />
        <IconButton
          icon="play-skip-forward"
          label="Next"
          size={32}
          disabled={!canGoNext}
          onPress={() => void audio.next()}
        />
        <View>
          <IconButton
            icon="repeat"
            label={repeatLabel}
            color={repeat === 'off' ? colors.textSecondary : colors.primary}
            onPress={() => {
              tap();
              audio.cycleRepeat();
            }}
          />
          {repeat === 'one' ? <View style={styles.repeatOneDot} /> : null}
        </View>
      </View>
      <View style={styles.secondaryRow}>
        <IconButton
          icon="play-back"
          label={`Back ${SKIP_SECONDS} seconds`}
          color={colors.textSecondary}
          onPress={() => void audio.skipBy(-SKIP_SECONDS)}
        />
        <IconButton
          icon="list"
          label="Queue"
          color={colors.textSecondary}
          onPress={() => router.push('/queue')}
        />
        <IconButton
          icon="play-forward"
          label={`Forward ${SKIP_SECONDS} seconds`}
          color={colors.textSecondary}
          onPress={() => void audio.skipBy(SKIP_SECONDS)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.lg },
  mainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  secondaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  repeatOneDot: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});
