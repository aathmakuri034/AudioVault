import { Text, type TextProps } from 'react-native';

import { colors, typography } from '@/theme';

type Variant = keyof typeof typography;
type Tone = 'primary' | 'secondary' | 'muted' | 'accent' | 'danger';

const TONE_COLOR: Record<Tone, string> = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  accent: colors.primary,
  danger: colors.danger,
};

export type AppTextProps = TextProps & { variant?: Variant; tone?: Tone };

/** Text with the app's type scale and color tones applied. */
export function AppText({ variant = 'body', tone = 'primary', style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[typography[variant], { color: TONE_COLOR[tone] }, style]} />;
}
