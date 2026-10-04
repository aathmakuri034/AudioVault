import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AppText, Artwork, type IconName } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

const SIZE = 136;

/** Square artwork card for horizontal shelves on Home. */
function MediaCardBase({
  title,
  subtitle,
  artworkUri,
  placeholderIcon,
  onPress,
  highlighted,
}: {
  title: string;
  subtitle: string;
  artworkUri: string | null;
  placeholderIcon?: IconName;
  onPress: () => void;
  highlighted?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
    >
      <Artwork uri={artworkUri} size={SIZE} radius={radii.md} placeholderIcon={placeholderIcon} />
      <AppText
        variant="bodyStrong"
        numberOfLines={1}
        style={highlighted ? { color: colors.primary } : null}
      >
        {title}
      </AppText>
      <AppText variant="caption" tone="secondary" numberOfLines={1}>
        {subtitle}
      </AppText>
    </Pressable>
  );
}

export const MediaCard = memo(MediaCardBase);

const styles = StyleSheet.create({
  card: { width: SIZE, gap: spacing.xs },
});
