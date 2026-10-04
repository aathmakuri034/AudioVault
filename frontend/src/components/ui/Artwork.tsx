import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radii } from '@/theme';

import { Icon, type IconName } from './Icon';

export type ArtworkProps = {
  /** Local file URI preferred; falls back to a generated placeholder. */
  uri: string | null | undefined;
  size: number;
  radius?: number;
  placeholderIcon?: IconName;
  style?: ViewStyle;
};

// Deterministic gradient per placeholder so each track looks distinct.
const GRADIENTS: [string, string][] = [
  ['#3A0A0A', '#FF0000'],
  ['#1E1E1E', '#CC0000'],
  ['#2B1055', '#D53A9D'],
  ['#0F2027', '#2C5364'],
  ['#232526', '#414345'],
];

export function Artwork({
  uri,
  size,
  radius = radii.md,
  placeholderIcon = 'musical-notes',
  style,
}: ArtworkProps) {
  const box = { width: size, height: size, borderRadius: radius };
  if (uri) {
    // Wrap in a View so callers can pass shadows/margins as plain view styles.
    return (
      <View style={[box, style]}>
        <Image
          source={{ uri }}
          style={[box, styles.image]}
          contentFit="cover"
          transition={150}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  const gradient = GRADIENTS[Math.abs(Math.round(size)) % GRADIENTS.length];
  return (
    <View style={[box, styles.clip, style]}>
      <LinearGradient
        colors={gradient}
        style={StyleSheet.absoluteFill}
        start={[0, 0]}
        end={[1, 1]}
      />
      <View style={styles.center}>
        <Icon name={placeholderIcon} size={size * 0.4} color="rgba(255,255,255,0.85)" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.elevated },
  clip: { overflow: 'hidden', backgroundColor: colors.elevated },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
