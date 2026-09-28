import { TabList, TabSlot, TabTrigger, TabTriggerSlotProps, Tabs } from 'expo-router/ui';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './ui';
import { useColors } from '@/lib/theme';

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
          <TabButton icon="chart.pie">Overview</TabButton>
        </TabTrigger>
        <TabTrigger name="transactions" href="/transactions" asChild>
          <TabButton icon="list.bullet">Expenses</TabButton>
        </TabTrigger>
        <TabTrigger name="reports" href="/reports" asChild>
          <TabButton icon="doc.text.magnifyingglass">Reports</TabButton>
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <TabButton icon="gearshape">Settings</TabButton>
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
  label: { fontSize: 10, fontWeight: '500' },
});
