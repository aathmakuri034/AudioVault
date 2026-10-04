import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { TOUCH_TARGET, colors, radii } from '@/theme';

import { Icon, type IconName } from './Icon';

export type IconButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
  /** Filled circular background, e.g. the main play button. */
  filled?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function IconButton({
  icon,
  label,
  onPress,
  size = 24,
  color = colors.textPrimary,
  filled = false,
  disabled,
  style,
}: IconButtonProps) {
  const diameter = filled ? Math.max(size * 2.4, TOUCH_TARGET) : TOUCH_TARGET;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { width: diameter, height: diameter },
        filled && { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
        !filled && pressed && { backgroundColor: colors.elevated },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
});
