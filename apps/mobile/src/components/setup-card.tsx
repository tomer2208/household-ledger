import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from './ui';
import { useDevices, useHousehold, useOverview } from '@/api/queries';
import { t } from '@/lib/i18n';
import { forwardIcon } from '@/lib/rtl';
import { dismissSetupCard, readSetupCardDismissed } from '@/lib/setup';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';
import { Pressable } from '@/components/pressable';

// P1-7: the three things that make the app work, ticked off as they happen: budgets, a partner
// (shared households are the point), and Apple Pay logging. Gone once all three are done, or
// when dismissed.
export function SetupCard() {
  const c = useColors();
  const hh = useHousehold();
  const overview = useOverview();
  const devices = useDevices();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    readSetupCardDismissed().then(setDismissed);
  }, []);

  if (dismissed !== false || !overview.data || !hh.data || !devices.data) return null;
  const items: { done: boolean; title: string; href: Href }[] = [
    { done: overview.data.categories.some((x) => (x.cap ?? 0) > 0), title: t.setup.cardBudgets, href: '/settings/categories' },
    { done: hh.data.members.length > 1, title: t.setup.invite, href: '/settings/household' },
    { done: devices.data.some((d) => !d.revoked_at), title: t.setup.cardApplePay, href: '/settings/devices' },
  ];
  const doneCount = items.filter((x) => x.done).length;
  if (doneCount === items.length) return null;

  return (
    <View style={[s.card, { backgroundColor: c.cell }]}>
      <View style={s.head}>
        <Text style={[s.title, { color: c.label }]}>{t.setup.cardTitle}</Text>
        <Text style={[s.count, { color: c.secondaryLabel }]}>
          {t.detail.installmentOf(doneCount, items.length)}
        </Text>
        <Pressable
          hitSlop={12}
          onPress={() => {
            setDismissed(true);
            dismissSetupCard();
          }}
          accessibilityRole="button"
          accessibilityLabel={t.setup.cardHide}>
          <Icon name="xmark.circle.fill" size={20} color={c.tertiaryLabel} />
        </Pressable>
      </View>
      {items.map((x) => (
        <Pressable
          key={x.title}
          onPress={x.done ? undefined : () => router.push(x.href)}
          disabled={x.done}
          accessibilityRole="button"
          accessibilityState={{ checked: x.done, disabled: x.done }}
          aria-checked={x.done}
          style={s.item}>
          <Icon name={x.done ? 'checkmark.circle.fill' : 'circle'} size={22} color={x.done ? c.green : c.tertiaryLabel} />
          <Text style={[s.itemText, { color: x.done ? c.secondaryLabel : c.label }, x.done && s.doneText]}>{x.title}</Text>
          {!x.done ? <Icon name={forwardIcon()} size={13} color={c.tertiaryLabel} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 14, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontFamily: fontFamily.body, flex: 1, fontSize: 17, fontWeight: '600' },
  count: { fontFamily: fontFamily.body, fontSize: 13 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  itemText: { fontFamily: fontFamily.body, flex: 1, fontSize: 16 },
  doneText: { textDecorationLine: 'line-through' },
});
