import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

// TODO(3.1): move the native session to the LargeSecureStore pattern (BLUEPRINT §3.9).
// AsyncStorage lives in the app sandbox; good enough for TestFlight, not for the store.
export const supabase = createClient(url, key, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refreshing only while foregrounded is the pattern Supabase documents for React Native.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const FUNCTIONS_URL = `${url}/functions/v1`;

// Public address of the web app, for links people share (invites). On web it is simply
// where the app is running; a native build needs EXPO_PUBLIC_APP_URL.
export const APP_URL =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.EXPO_PUBLIC_APP_URL ?? 'https://finpace.app');
