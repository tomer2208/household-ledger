import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dark, light, radius, useColors } from '@/lib/theme';

// One bottom toast at a time, with an optional Undo. `onExpire` runs when the toast leaves
// without its action being used (timeout or replaced by the next toast), which is how a
// deferred delete gets committed.
type Toast = { message: string; action?: { label: string; onPress: () => void }; onExpire?: () => void };

const ToastContext = createContext<(t: Toast) => void>(() => {});
export const useToast = () => useContext(ToastContext);

const DURATION = 5000;
// Clears the tab bar on both the native and web tabs, and the floating Add expense button above it.
const TAB_BAR = 64;
const ADD_BUTTON = 76;

export function ToastProvider({ children }: { children: ReactNode }) {
  const c = useColors();
  // The toast is inverted (ink on light, light on dark), so its action takes the other mode's teal.
  const actionColor = useColorScheme() === 'dark' ? light.tint : dark.tint;
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<(Toast & { key: number }) | null>(null);
  const current = useRef<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback((usedAction: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const t = current.current;
    current.current = null;
    setToast(null);
    if (t && !usedAction) t.onExpire?.();
  }, []);

  const show = useCallback(
    (t: Toast) => {
      if (current.current) finish(false);
      current.current = t;
      setToast({ ...t, key: Date.now() });
      AccessibilityInfo.announceForAccessibility(t.message);
      timer.current = setTimeout(() => finish(false), DURATION);
    },
    [finish],
  );

  useEffect(() => () => finish(false), [finish]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.key}
          entering={FadeInDown.duration(200)}
          exiting={FadeOut.duration(150)}
          pointerEvents="box-none"
          style={[s.wrap, { bottom: insets.bottom + TAB_BAR + ADD_BUTTON }]}>
          <View style={[s.toast, { backgroundColor: c.label }]} accessibilityLiveRegion="polite">
            <Text style={[s.message, { color: c.cell }]} numberOfLines={2}>
              {toast.message}
            </Text>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                style={s.action}
                onPress={() => {
                  toast.action!.onPress();
                  finish(true);
                }}>
                <Text style={[s.actionText, { color: actionColor }]}>{toast.action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    maxWidth: 480,
    width: '100%',
    borderRadius: radius.hero,
    paddingLeft: 16,
    paddingRight: 4,
  },
  message: { flex: 1, fontSize: 15, paddingVertical: 12 },
  action: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  actionText: { fontSize: 15, fontWeight: '700' },
});
