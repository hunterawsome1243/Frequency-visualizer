import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Neon } from '@/constants/theme';
import { NicknamesProvider } from '@/context/nicknames-context';
import { ScanProvider } from '@/context/scan-context';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  // Opening a device link directly still puts the tabs underneath, so Back has somewhere to go.
  anchor: '(tabs)',
};

const NeonTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Neon.cyan,
    background: Neon.background,
    card: Neon.surface,
    text: Neon.text,
    border: Neon.border,
    notification: Neon.magenta,
  },
};

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <ThemeProvider value={NeonTheme}>
      <NicknamesProvider>
        <ScanProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: Neon.surface },
              headerTintColor: Neon.cyan,
              headerTitleStyle: { color: Neon.text, fontWeight: '700' },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: Neon.background },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="device/[id]"
              options={{ title: 'Device details', headerBackTitle: 'Back' }}
            />
          </Stack>
        </ScanProvider>
      </NicknamesProvider>
    </ThemeProvider>
  );
}
