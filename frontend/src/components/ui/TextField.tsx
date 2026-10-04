import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radii, spacing, typography } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type TextFieldProps = TextInputProps & {
  label?: string;
  icon?: IconName;
  error?: string | null;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, icon, error, style, ...rest },
  ref,
) {
  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText variant="caption" tone="secondary">
          {label}
        </AppText>
      ) : null}
      <View style={[styles.field, error ? styles.fieldError : null]}>
        {icon ? <Icon name={icon} size={20} color={colors.textSecondary} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          keyboardAppearance="dark"
          accessibilityLabel={label ?? rest.placeholder}
          style={[styles.input, style]}
          {...rest}
        />
      </View>
      {error ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.elevated,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 50,
  },
  fieldError: { borderColor: colors.danger },
  input: { flex: 1, color: colors.textPrimary, ...typography.body, paddingVertical: spacing.md },
});
