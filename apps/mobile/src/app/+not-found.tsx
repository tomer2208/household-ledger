import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { Empty } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useColors } from '@/lib/theme';

// QA-5: an address that isn't a screen. Expo's own page was in English, black, and listed every
// route under "Sitemap"; this one is the app's, in its language, with the way home.
export default function NotFound() {
  const c = useColors();
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: c.groupedBackground }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Empty
        icon="questionmark.circle"
        title={t.notFound.title}
        message={t.notFound.body}
        action={{ label: t.notFound.home, onPress: () => router.replace('/') }}
      />
    </View>
  );
}
