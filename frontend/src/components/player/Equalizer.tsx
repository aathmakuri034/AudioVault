import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme';

const BARS = [0.55, 1, 0.75];
const DURATIONS = [420, 360, 480];

function Bar({
  peak,
  duration,
  active,
  height,
}: {
  peak: number;
  duration: number;
  active: boolean;
  height: number;
}) {
  const scale = useSharedValue(0.35);

  useEffect(() => {
    if (active) {
      scale.set(
        withRepeat(withTiming(peak, { duration, easing: Easing.inOut(Easing.quad) }), -1, true),
      );
    } else {
      cancelAnimation(scale);
      scale.set(withTiming(0.35, { duration: 200 }));
    }
    return () => cancelAnimation(scale);
  }, [active, duration, peak, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.get() }] }));
  return <Animated.View style={[styles.bar, { height }, style]} />;
}

/** Three animated bars; they settle when playback pauses. */
export function Equalizer({ active, height = 14 }: { active: boolean; height?: number }) {
  return (
    <View
      style={[styles.row, { height }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {BARS.map((peak, i) => (
        <Bar key={i} peak={peak} duration={DURATIONS[i]} active={active} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 1.5, backgroundColor: colors.primary },
});
