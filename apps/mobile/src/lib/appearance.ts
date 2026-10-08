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

// Web: the phone's light/dark. An installed web app on iOS often hears nothing when it changes
// (Control Center opens over the app, so it doesn't even leave the front), and screens stayed
// in the old colours until the app was reopened. The page's CSS does update at once, so a
// hidden box in public/index.html is 2px wide in dark and 1px in light, and its size is
// watched. The change event and coming back to the front are checked too.
const darkQuery = Platform.OS === 'web' && typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
const probe = darkQuery ? document.getElementById('scheme-probe') : null;
const readDark = () => (probe ? probe.getBoundingClientRect().width > 1.5 : !!darkQuery?.matches);
const webListeners = new Set<() => void>();
let webDark = readDark();
function recheck() {
  const now = readDark();
  if (now === webDark) return;
  webDark = now;
  webListeners.forEach((l) => l());
}
if (darkQuery) {
  darkQuery.addEventListener?.('change', recheck);
  window.addEventListener('focus', recheck);
  window.addEventListener('pageshow', recheck);
  document.addEventListener('visibilitychange', recheck);
  if (probe && typeof ResizeObserver !== 'undefined') new ResizeObserver(recheck).observe(probe);
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
