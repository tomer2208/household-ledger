import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './ui';
import { applyUpdate, useUpdateAvailable } from '@/lib/app-update';
import { t } from '@/lib/i18n';
import { radius, useColors } from '@/lib/theme';

// T15: a new build is out. A small pill at the top of every screen; the refresh is the
// person's call, so nothing they are typing is lost.
export function UpdateBanner() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <Pressable
      onPress={applyUpdate}
      accessibilityRole="button"
      accessibilityLabel={`${t.update.title}. ${t.update.action}`}
      accessibilityLiveRegion="polite"
      style={({ pressed }) => [s.pill, { top: insets.top + 8, backgroundColor: c.label }, pressed && { opacity: 0.85 }]}>
      <Icon name="arrow.triangle.2.circlepath" size={16} color={c.cell} />
      <Text style={[s.text, { color: c.cell }]}>{t.update.title}</Text>
      <Text style={[s.action, { color: c.cell }]}>{t.update.action}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    zIndex: 10,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  text: { fontSize: 14, fontWeight: '500' },
  action: { fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
});
