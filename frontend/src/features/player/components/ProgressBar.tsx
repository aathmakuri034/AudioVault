import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { getAudioService } from '@/services/audio/playbackService';
import { usePlayerStore } from '@/store/playerStore';
import { colors, spacing } from '@/theme';
import { formatDuration } from '@/utils/format';

/** Seekable progress with elapsed and remaining time. */
export function ProgressBar() {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  // While dragging, show the thumb position instead of live playback position.
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  const shown = scrubbing ?? position;
  const max = Math.max(duration, 1);
  const remaining = Math.max(duration - shown, 0);

  return (
    <View>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={max}
        value={Math.min(shown, max)}
        minimumTrackTintColor={colors.textPrimary}
        maximumTrackTintColor="rgba(255,255,255,0.25)"
        thumbTintColor={colors.textPrimary}
        onSlidingStart={(v) => setScrubbing(v)}
        onValueChange={(v) => scrubbing != null && setScrubbing(v)}
        onSlidingComplete={(v) => {
          void getAudioService()
            .seekTo(v)
            .finally(() => setScrubbing(null));
        }}
        accessibilityLabel="Playback position"
        accessibilityValue={{ text: `${formatDuration(shown)} of ${formatDuration(duration)}` }}
      />
      <View style={styles.times}>
        <AppText variant="micro" tone="secondary">
          {formatDuration(shown)}
        </AppText>
        <AppText variant="micro" tone="secondary">
          -{formatDuration(remaining)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slider: { width: '100%', height: 40 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -spacing.xs },
});
