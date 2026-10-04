import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { TOUCH_TARGET, colors, radii, spacing } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
};

const BG: Record<Variant, [string, string]> = {
  primary: [colors.primary, colors.primaryPressed],
  secondary: [colors.elevated, colors.elevatedPressed],
  ghost: ['transparent', colors.elevated],
  danger: [colors.elevated, colors.elevatedPressed],
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
}: ButtonProps) {
  const inactive = disabled || loading;
  const fg = variant === 'danger' ? colors.danger : colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: BG[variant][pressed ? 1 : 0], opacity: inactive ? 0.5 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={20} color={fg} /> : null}
          <AppText variant="bodyStrong" style={{ color: fg }}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH_TARGET + 6,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
