import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useOverview } from '@/api/queries';

// Real UITabBar on iOS (liquid glass, SF Symbols). Web uses app-tabs.web.tsx.
export default function AppTabs() {
  const pending = useOverview().data?.pending_review ?? 0;
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="overview">
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.pie', selected: 'chart.pie.fill' }} />
        <NativeTabs.Trigger.Label>Overview</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="transactions">
        <NativeTabs.Trigger.Icon sf="list.bullet" />
        <NativeTabs.Trigger.Label>Expenses</NativeTabs.Trigger.Label>
        {pending > 0 ? <NativeTabs.Trigger.Badge>{String(pending)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reports">
        <NativeTabs.Trigger.Icon sf="doc.text.magnifyingglass" />
        <NativeTabs.Trigger.Label>Reports</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
