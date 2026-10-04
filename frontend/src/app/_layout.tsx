import { SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { EmptyState } from '@/components/ui';
import { navigationTheme, stackHeaderOptions } from '@/navigation/theme';
import { initializeApp } from '@/services/bootstrap';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const boot = useCallback(() => {
    initializeApp()
      .then(() => setState('ready'))
      .catch(() => setState('error'))
      .finally(() => SplashScreen.hide());
  }, []);

  useEffect(boot, [boot]);

  const retry = () => {
    setState('loading');
    boot();
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="light" />
        {state === 'error' ? (
          <View style={styles.center}>
            <EmptyState
              icon="alert-circle-outline"
              title="AudioVault couldn’t start"
              message="Your library could not be opened. Your downloads are safe on this device."
              actionLabel="Try again"
              onAction={retry}
            />
          </View>
        ) : state === 'ready' ? (
          <RootStack />
        ) : null}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  return (
    <Stack screenOptions={stackHeaderOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="now-playing"
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen name="queue" options={{ title: 'Queue', presentation: 'modal' }} />
      <Stack.Screen name="playlist/[id]" options={{ title: '' }} />
      <Stack.Screen
        name="playlist/edit"
        options={{
          title: 'New Playlist',
          presentation: 'formSheet',
          sheetAllowedDetents: [0.5, 0.9],
        }}
      />
      <Stack.Screen name="song/[id]" options={{ title: 'Song Details', presentation: 'modal' }} />
      <Stack.Screen name="download/[id]" options={{ title: 'Download' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
});
