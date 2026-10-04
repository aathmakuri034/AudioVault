import { Pressable, StyleSheet } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText } from './AppText';

/** Pill toggle used for segments and filters. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      hitSlop={6}
      style={[styles.chip, selected ? styles.selected : styles.idle]}
    >
      <AppText
        variant="caption"
        style={{ color: selected ? colors.background : colors.textPrimary }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    minHeight: 36,
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.textPrimary },
  idle: { backgroundColor: colors.elevated },
});
