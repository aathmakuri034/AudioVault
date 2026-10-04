import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Artwork, Icon } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import type { DownloadRecord } from '@/types/models';

import { STATUS_LABEL } from '../downloadMachine';

/** Compact progress row for an import. */
function DownloadRowBase({
  record,
  onPress,
}: {
  record: DownloadRecord;
  onPress: (record: DownloadRecord) => void;
}) {
  const failed = record.status === 'failed';
  const done = record.status === 'completed';
  return (
    <Pressable
      onPress={() => onPress(record)}
      accessibilityRole="button"
      accessibilityLabel={`${record.metadata.title}: ${STATUS_LABEL[record.status]}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}
    >
      <Artwork uri={record.metadata.thumbnail} size={48} radius={6} />
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {record.metadata.title}
        </AppText>
        <AppText variant="caption" tone={failed ? 'danger' : 'secondary'} numberOfLines={1}>
          {failed ? (record.errorMessage ?? STATUS_LABEL.failed) : STATUS_LABEL[record.status]}
          {!failed && !done ? ` · ${record.progress}%` : ''}
        </AppText>
        {!failed && !done ? (
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: record.progress }}
          >
            <View style={[styles.fill, { width: `${record.progress}%` }]} />
          </View>
        ) : null}
      </View>
      <Icon
        name={failed ? 'alert-circle' : done ? 'checkmark-circle' : 'cloud-download-outline'}
        size={22}
        color={failed ? colors.danger : done ? colors.success : colors.textSecondary}
      />
    </Pressable>
  );
}

export const DownloadRow = memo(DownloadRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1, gap: 4 },
  track: {
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: 3, backgroundColor: colors.primary },
});
