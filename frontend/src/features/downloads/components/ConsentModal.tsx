import { Modal, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

export const CONSENT_TEXT =
  'I confirm that I own this content or have permission to download and store it.';

/** Shown before the first download; the choice is remembered. */
export function ConsentModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.badge}>
            <Icon name="shield-checkmark" size={28} color={colors.primary} />
          </View>
          <AppText variant="heading" style={styles.center} accessibilityRole="header">
            Only import content you’re allowed to keep
          </AppText>
          <AppText tone="secondary" style={styles.center}>
            AudioVault saves audio to this device for offline listening. Only import media you own,
            or that you have the rights or permission to download.
          </AppText>
          <View style={styles.quote}>
            <AppText variant="bodyStrong">“{CONSENT_TEXT}”</AppText>
          </View>
          <Button label="I confirm" onPress={onConfirm} />
          <Button label="Cancel" variant="ghost" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.elevated,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  badge: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  quote: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
});
