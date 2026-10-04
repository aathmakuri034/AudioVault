import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { navigationTheme, stackHeaderOptions } from '@/navigation/theme';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="light" />
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
          <Stack.Screen
            name="song/[id]"
            options={{ title: 'Song Details', presentation: 'modal' }}
          />
          <Stack.Screen name="download/[id]" options={{ title: 'Download' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
