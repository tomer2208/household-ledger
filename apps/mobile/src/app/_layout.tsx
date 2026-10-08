import { DarkTheme, DefaultTheme, LocaleProvider, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useHousehold, useLanguageSync, useRealtimeSync } from '@/api/queries';
import { SessionProvider, useSession } from '@/api/session';
import { ToastProvider } from '@/components/toast';
import { UpdateBanner } from '@/components/update-banner';
import { dark, light, type Palette } from '@/lib/colors';
import { fontFamily } from '@/lib/tokens';
import { setAppTimeZone } from '@/lib/dates';
import { isRTL, t } from '@/lib/i18n';
import { bootLanguage, bootLanguageSync } from '@/lib/lang-store';
import { usePushRegistration, useNotificationRouting } from '@/lib/push';
import { QueryProvider } from '@/lib/query';
import { bootAppearance, useScheme } from '@/lib/appearance';
import { useEdgeSwipeBack } from '@/lib/edge-swipe-back';

SplashScreen.preventAutoHideAsync();

// Headers, back buttons and screen backgrounds take the FinPace palette instead of iOS blue.
// F3: header titles and back buttons in Assistant, like the rest of the text.
const body = (fontWeight: '400' | '600' | '700') => ({ fontFamily: fontFamily.body, fontWeight });
const navTheme = (base: Theme, p: Palette): Theme => ({
  ...base,
  fonts: { regular: body('400'), medium: body('600'), bold: body('700'), heavy: body('700') },
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
  // P1-6: the language is known before the first screen renders. The web reads it at once;
  // a phone reads its storage first, behind the splash screen.
  const [langReady, setLangReady] = useState(bootLanguageSync);
  // P5: the appearance chosen in Settings, before the first screen
  useEffect(() => {
    bootAppearance();
  }, []);
  useEffect(() => {
    if (!langReady) bootLanguage().finally(() => setLangReady(true));
  }, [langReady]);
  if (!langReady) return null;
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
  const scheme = useScheme();
  const { session, loading } = useSession();
  const hh = useHousehold();
  const household = hh.data?.household ?? null;
  // R10: dates everywhere follow the household's clock, like budget_month on the server.
  // Set during render so every screen below reads it on its first render.
  setAppTimeZone(household?.timezone);
  useRealtimeSync(household?.id);
  // The server writes push alerts and reports in each member's language.
  useLanguageSync(hh.data?.me);
  usePushRegistration(session?.user.id, !!household);
  useNotificationRouting();
  useEdgeSwipeBack();

  const ready = !loading && (!session || !hh.isLoading);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const signedIn = !!session;
  const direction = isRTL() ? 'rtl' : 'ltr';
  return (
    <ThemeProvider value={scheme === 'dark' ? darkNav : lightNav}>
      {/* Headers and back buttons follow the language; `dir` flips every row below on the web. */}
      <LocaleProvider direction={direction}>
        <View style={{ flex: 1 }} {...({ dir: direction } as object)}>
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
                <Stack.Screen name="transaction/[id]" options={{ title: t.detail.title, headerBackTitle: t.common.back }} />
                <Stack.Screen name="review" options={{ title: t.review.title, headerBackTitle: t.common.back }} />
              </Stack.Protected>
            </Stack>
            <UpdateBanner />
          </ToastProvider>
        </View>
      </LocaleProvider>
    </ThemeProvider>
  );
}
