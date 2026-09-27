import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Budget alerts are the only pushes this app sends (Batch 2 §4), so showing them as a
// banner while the app is open is right: they are rare and always worth seeing.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Registers this phone for budget alerts once the user has a household (US-S2).
// Asking only after onboarding, not at first launch, keeps the permission prompt in context.
export function usePushRegistration(userId: string | undefined, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !userId || Platform.OS === 'web' || !Device.isDevice) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      // No EAS project yet (Phase 3.10). Nothing to register until `eas init` runs.
      console.warn('Push: no EAS projectId, skipping registration');
      return;
    }
    (async () => {
      const current = await Notifications.getPermissionsAsync();
      const status = current.granted ? current : await Notifications.requestPermissionsAsync();
      if (!status.granted) return;
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      await supabase
        .from('push_tokens')
        .upsert({ user_id: userId, expo_push_token: token, updated_at: new Date().toISOString() });
    })().catch((e) => console.warn('Push registration failed', e));
  }, [userId, enabled]);
}

// A tapped alert opens that category's expenses; the server sends an Expo Router path.
export function useNotificationRouting() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = last?.notification.request.content.data?.url;
    if (typeof url === 'string' && last?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      router.push(url as never);
    }
  }, [last]);
}
