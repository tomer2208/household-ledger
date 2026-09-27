import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { useHousehold, useRealtimeSync } from '@/api/queries';
import { SessionProvider, useSession } from '@/api/session';
import { usePushRegistration, useNotificationRouting } from '@/lib/push';
import { QueryProvider } from '@/lib/query';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <QueryProvider>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </QueryProvider>
  );
}

function Root() {
  const scheme = useColorScheme();
  const { session, loading } = useSession();
  const hh = useHousehold();
  const household = hh.data?.household ?? null;
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
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !household}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !!household}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="add"
            options={{ presentation: 'formSheet', sheetAllowedDetents: [0.92], sheetGrabberVisible: true, headerShown: false }}
          />
          <Stack.Screen name="transaction/[id]" options={{ title: 'Expense', headerBackTitle: 'Back' }} />
          <Stack.Screen name="review" options={{ title: 'To Review', headerBackTitle: 'Back' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
