import { TabList, TabSlot, TabTrigger, TabTriggerSlotProps, Tabs } from 'expo-router/ui';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Icon } from './ui';
import { useColors } from '@/lib/theme';

// Web preview only: a bottom bar shaped like the iOS one so layouts can be checked in a browser.
export default function AppTabs() {
  const c = useColors();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { backgroundColor: c.cell, borderTopColor: c.separator }]}>
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
    <Pressable {...props} style={styles.button}>
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
