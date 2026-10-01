import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useHousehold, useRealtimeSync } from '@/api/queries';
import { SessionProvider, useSession } from '@/api/session';
import { ToastProvider } from '@/components/toast';
import { dark, light, type Palette } from '@/lib/colors';
import { setAppTimeZone } from '@/lib/dates';
import { usePushRegistration, useNotificationRouting } from '@/lib/push';
import { QueryProvider } from '@/lib/query';

SplashScreen.preventAutoHideAsync();

// Headers, back buttons and screen backgrounds take the FinPace palette instead of iOS blue.
const navTheme = (base: Theme, p: Palette): Theme => ({
  ...base,
  colors: {
    ...base.colors,
    primary: p.tint as string,
    background: p.groupedBackground as string,
    card: p.cell as string,
    text: p.label as string,
    border: p.separator as string,
  },
});
const lightNav = navTheme(DefaultTheme, light);
const darkNav = navTheme(DarkTheme, dark);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryProvider>
        <SessionProvider>
          <Root />
        </SessionProvider>
      </QueryProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const scheme = useColorScheme();
  const { session, loading } = useSession();
  const hh = useHousehold();
  const household = hh.data?.household ?? null;
  // R10: dates everywhere follow the household's clock, like budget_month on the server.
  // Set during render so every screen below reads it on its first render.
  setAppTimeZone(household?.timezone);
  useRealtimeSync(household?.id);
  usePushRegistration(session?.user.id, !!household);
  useNotificationRouting();

  const ready = !loading && (!session || !hh.isLoading);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const signedIn = !!session;
  return (
    <ThemeProvider value={scheme === 'dark' ? darkNav : lightNav}>
      <ToastProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="join/[code]" options={{ headerShown: false }} />
          <Stack.Screen name="dev-preview" />
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !household}>
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !!household}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="setup" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen
              name="add"
              options={{ presentation: 'formSheet', sheetAllowedDetents: [0.92], sheetGrabberVisible: true, headerShown: false }}
            />
            <Stack.Screen name="transaction/[id]" options={{ title: 'Expense', headerBackTitle: 'Back' }} />
            <Stack.Screen name="review" options={{ title: 'To Review', headerBackTitle: 'Back' }} />
          </Stack.Protected>
        </Stack>
      </ToastProvider>
    </ThemeProvider>
  );
}
