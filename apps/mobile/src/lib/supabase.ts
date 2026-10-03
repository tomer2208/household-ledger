import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/api/database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

// TODO(3.1): move the native session to the LargeSecureStore pattern (BLUEPRINT §3.9).
// AsyncStorage lives in the app sandbox; good enough for TestFlight, not for the store.
// T5: typed by the schema (api/database.types.ts, generated; CI fails if it is stale), so a
// wrong table, column, function or argument name is a type error, not a broken screen.
export const supabase = createClient<Database>(url, key, {
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

type Fns = Database['public']['Functions'];

// supabase.rpc infers its arguments' type from the object it is given, so a misspelled optional
// argument would pass. Here they are checked against the function's own, like any typed call.
export function rpc<F extends keyof Fns & string>(fn: F, args?: Fns[F]['Args']) {
  return supabase.rpc(fn, args);
}

export const FUNCTIONS_URL = `${url}/functions/v1`;

// Public address of the web app, for links people share (invites). On web it is simply
// where the app is running; a native build needs EXPO_PUBLIC_APP_URL.
export const APP_URL =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.EXPO_PUBLIC_APP_URL ?? 'https://finpace.app');
