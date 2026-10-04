import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

type ScreenProps = {
  children: ReactNode;
  /** Scrollable content (default) or a fixed container for lists that scroll themselves. */
  scroll?: boolean;
  /** Pad the top with the safe-area inset; tab screens without a native header want this. */
  padTop?: boolean;
} & Pick<ScrollViewProps, 'keyboardShouldPersistTaps' | 'refreshControl'>;

export function Screen({ children, scroll = true, padTop = false, ...scrollProps }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const top = padTop ? insets.top + spacing.sm : 0;
  if (!scroll) {
    return <View style={[styles.root, { paddingTop: top }]}>{children}</View>;
  }
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: top, paddingBottom: spacing.xxxl }}
      contentInsetAdjustmentBehavior="automatic"
      {...scrollProps}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
