import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './ui';
import { t } from '@/lib/i18n';
import { isInstalled } from '@/lib/install';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

const DISMISSED = 'install-banner-dismissed';

// G12: in a browser tab the app works, but alerts and the full-screen feel need the Home
// Screen version. A quiet nudge on Overview until it's installed or dismissed.
export function InstallBanner() {
  const c = useColors();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isInstalled()) return;
    AsyncStorage.getItem(DISMISSED)
      .then((v) => setShow(!v))
      .catch(() => setShow(true));
  }, []);

  if (!show) return null;
  return (
    <Pressable
      onPress={() => router.push('/settings/install')}
      style={[s.banner, { backgroundColor: c.cell }]}
      accessibilityRole="button"
      accessibilityLabel={t.banner.installA11y}>
      <Icon name="square.and.arrow.up" size={20} color={c.tint} />
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: c.label }]}>{t.banner.installTitle}</Text>
        <Text style={[s.text, { color: c.secondaryLabel }]}>{t.banner.installBody}</Text>
      </View>
      <Pressable
        hitSlop={10}
        onPress={() => {
          setShow(false);
          AsyncStorage.setItem(DISMISSED, '1').catch(() => {});
        }}
        accessibilityLabel={t.banner.dismiss}>
        <Icon name="xmark.circle.fill" size={20} color={c.tertiaryLabel} />
      </Pressable>
    </Pressable>
  );
}

const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14 },
  title: { fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
  text: { fontFamily: fontFamily.body, fontSize: 13, marginTop: 2 },
});
