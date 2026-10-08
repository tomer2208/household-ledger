import { TabList, TabSlot, TabTrigger, TabTriggerSlotProps, Tabs } from 'expo-router/ui';
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './ui';
import { t } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';
import { Pressable } from '@/components/pressable';

// Web (installed PWA): a bottom bar shaped like the iOS one. It sits above the home
// indicator: viewport-fit=cover draws edge to edge, and the inset pads it back.
export default function AppTabs() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { backgroundColor: c.cell, borderTopColor: c.separator, paddingBottom: Math.max(6, insets.bottom) }]}>
        <TabTrigger name="overview" href="/overview" asChild>
          <TabButton icon="envelope">{t.tabs.overview}</TabButton>
        </TabTrigger>
        <TabTrigger name="transactions" href="/transactions" asChild>
          <TabButton icon="list.bullet">{t.tabs.expenses}</TabButton>
        </TabTrigger>
        <TabTrigger name="reports" href="/reports" asChild>
          <TabButton icon="doc.text.magnifyingglass">{t.tabs.reports}</TabButton>
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <TabButton icon="gearshape">{t.tabs.settings}</TabButton>
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, icon, ...props }: TabTriggerSlotProps & { icon: string }) {
  const c = useColors();
  const color = isFocused ? c.tint : c.secondaryLabel;
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }} style={styles.button}>
      <Icon name={icon} size={22} color={color} />
      <Text style={[styles.label, { color }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 6 },
  button: { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2, minHeight: 49 },
  label: { fontFamily: fontFamily.body, fontSize: 10, fontWeight: '500' },
});
