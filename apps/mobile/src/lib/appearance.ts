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

// The scheme every screen draws with: the choice, else the phone's.
export function useScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const picked = useAppearanceChoice();
  return picked === 'system' ? (system === 'dark' ? 'dark' : 'light') : picked;
}
