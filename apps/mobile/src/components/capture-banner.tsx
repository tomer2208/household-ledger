import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './ui';
import { useCaptureHealth } from '@/api/queries';
import type { CaptureHealth } from '@/api/types';
import { t } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

const SNOOZE_KEY = 'capture-banner-snooze';
const SNOOZE_MS = 3 * 86_400_000;

type Snoozes = Record<string, number>; // device id → snoozed until (ms)

// R9: a Shortcut that stops logging fails silently, so Overview says so, for every device in
// the household (a partner can nudge). "Silent" is judged on the server against the device's
// own habit (capture_health). Snooze hides one device's banner for 3 days on this phone.
export function CaptureBanner() {
  const health = useCaptureHealth();
  // Snoozes and the moment they're compared against, read once when Overview opens.
  const [state, setState] = useState<{ snoozes: Snoozes; now: number } | null>(null);

  useEffect(() => {
    const now = Date.now();
    AsyncStorage.getItem(SNOOZE_KEY)
      .then((v) => setState({ snoozes: v ? JSON.parse(v) : {}, now }))
      .catch(() => setState({ snoozes: {}, now }));
  }, []);

  if (!state) return null;
  const { snoozes, now } = state;
  const due = (health.data ?? []).filter((d) => d.status !== 'ok' && !((snoozes[d.device_id] ?? 0) > now));
  if (due.length === 0) return null;

  const snooze = (id: string) => {
    const next = { ...snoozes, [id]: now + SNOOZE_MS };
    setState({ snoozes: next, now });
    AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify(next)).catch(() => {});
  };

  return (
    <>
      {due.map((d) => (
        <Banner key={d.device_id} d={d} onSnooze={() => snooze(d.device_id)} />
      ))}
    </>
  );
}

export const silentDays = (d: CaptureHealth) => Math.floor((d.silent_hours ?? 0) / 24);

function Banner({ d, onSnooze }: { d: CaptureHealth; onSnooze: () => void }) {
  const c = useColors();
  const silent = d.status === 'silent';
  const title = silent ? t.banner.silentTitle(d.label, silentDays(d)) : t.banner.setupTitle(d.label);
  const text = silent
    ? t.banner.silentBody
    : t.banner.setupBody;
  return (
    <View style={[s.banner, { backgroundColor: c.cell, borderColor: c.orange }]} accessibilityRole="alert">
      <Icon name="exclamationmark.triangle.fill" size={20} color={c.orange} />
      <View style={{ flex: 1, gap: 8 }}>
        <View>
          <Text style={[s.title, { color: c.label }]}>{title}</Text>
          <Text style={[s.text, { color: c.secondaryLabel }]}>{text}</Text>
        </View>
        <View style={s.actions}>
          <Pressable
            onPress={() => router.push('/settings/devices')}
            accessibilityRole="button"
            accessibilityLabel={t.banner.checkA11y(d.label)}
            hitSlop={8}
            style={[s.button, { backgroundColor: c.tint }]}>
            <Text style={[s.buttonText, { color: c.onTint }]}>{t.banner.check}</Text>
          </Pressable>
          <Pressable
            onPress={onSnooze}
            accessibilityRole="button"
            accessibilityLabel={t.banner.snoozeA11y(d.label)}
            hitSlop={8}
            style={[s.button, { backgroundColor: c.fill }]}>
            <Text style={[s.buttonText, { color: c.label }]}>{t.banner.snooze}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  title: { fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
  text: { fontFamily: fontFamily.body, fontSize: 13, marginTop: 2, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  button: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
});
