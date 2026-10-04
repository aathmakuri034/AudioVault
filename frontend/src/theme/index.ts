/**
 * Design tokens. A dark, red-accented palette with original styling.
 * Components import tokens from here rather than hard-coding values.
 */
export const colors = {
  background: '#0F0F0F',
  card: '#181818',
  elevated: '#212121',
  elevatedPressed: '#2A2A2A',
  border: '#2E2E2E',
  primary: '#FF0000',
  primaryPressed: '#CC0000',
  secondaryRed: '#CC0000',
  textPrimary: '#FFFFFF',
  textSecondary: '#AAAAAA',
  textMuted: '#717171',
  success: '#2BA640',
  warning: '#F5B400',
  danger: '#FF4E45',
  overlay: 'rgba(0, 0, 0, 0.6)',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '500' },
  bodyStrong: { fontSize: 15, fontWeight: '700' },
  caption: { fontSize: 13, fontWeight: '500' },
  micro: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  artwork: {
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
} as const;

/** Minimum touch target in points, following the iOS HIG and Material guidance. */
export const TOUCH_TARGET = 44;

export const theme = { colors, spacing, radii, typography, shadows } as const;
export type Theme = typeof theme;
