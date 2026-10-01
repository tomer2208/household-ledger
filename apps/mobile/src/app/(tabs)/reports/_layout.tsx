import { Stack } from 'expo-router';

import { t } from '@/lib/i18n';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerLargeTitle: true, headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: t.tabs.reports }} />
    </Stack>
  );
}
