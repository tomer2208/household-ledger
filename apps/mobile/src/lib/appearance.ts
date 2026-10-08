import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

// P5: light, dark, or follow the phone, chosen in Settings and kept on this device. On iOS and
// Android the system appearance is overridden, so native headers and system colours follow too;
// the web has no such switch, so screens read the choice from here (useScheme).

export type AppearanceChoice = 'system' | 'light' | 'dark';
const KEY = 'appearance';
let choice: AppearanceChoice = 'system';
const listeners = new Set<() => void>();

function apply(next: AppearanceChoice) {
  choice = next;
  if (Platform.OS !== 'web') Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
  else if (typeof document !== 'undefined') document.documentElement.style.colorScheme = next === 'system' ? 'light dark' : next;
  listeners.forEach((l) => l());
}

export async function bootAppearance() {
  const saved = await AsyncStorage.getItem(KEY).catch(() => null);
  if (saved === 'light' || saved === 'dark') apply(saved);
}

export async function setAppearance(next: AppearanceChoice) {
  apply(next);
  await AsyncStorage.setItem(KEY, next).catch(() => {});
}

export function useAppearanceChoice() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => choice,
    () => choice,
  );
}

// Web: the phone's light/dark, read again whenever the app comes back to the front. An installed
// web app on iOS doesn't always hear the change made in Control Center while it was in the
// background, so screens stayed in the old colours until the app was reopened.
const darkQuery = Platform.OS === 'web' && typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
const webListeners = new Set<() => void>();
let webDark = !!darkQuery?.matches;
function recheck() {
  const now = !!darkQuery?.matches;
  if (now === webDark) return;
  webDark = now;
  webListeners.forEach((l) => l());
}
if (darkQuery) {
  darkQuery.addEventListener?.('change', recheck);
  window.addEventListener('focus', recheck);
  window.addEventListener('pageshow', recheck);
  document.addEventListener('visibilitychange', recheck);
}
function useWebSystemScheme(): 'light' | 'dark' {
  const dark = useSyncExternalStore(
    (l) => (webListeners.add(l), () => webListeners.delete(l)),
    () => webDark,
    () => webDark,
  );
  return dark ? 'dark' : 'light';
}
const useSystemScheme = darkQuery ? useWebSystemScheme : useColorScheme;

// The scheme every screen draws with: the choice, else the phone's.
export function useScheme(): 'light' | 'dark' {
  const system = useSystemScheme();
  const picked = useAppearanceChoice();
  return picked === 'system' ? (system === 'dark' ? 'dark' : 'light') : picked;
}
