import { Redirect, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Button, CategoryIcon, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { monthPace } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { budgetTone, moneyText, radius, useColors } from '@/lib/theme';

// Dev builds only: the design system on sample data, so UI work can be checked in the
// web preview without signing in to a real household. Production redirects home.
const SAMPLE = [
  { name: 'Groceries', symbol: 'cart', spent: 138000, cap: 200000 },
  { name: 'Eating out', symbol: 'fork.knife', spent: 89000, cap: 80000 },
  { name: 'Fuel', symbol: 'fuelpump', spent: 45500, cap: 50000 },
  { name: 'Kids', symbol: 'figure.and.child.holdinghands', spent: 30000, cap: 150000 },
];

export default function DevPreview() {
  const c = useColors();
  if (!__DEV__) return <Redirect href="/" />;
  const pace = monthPace();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Design preview', headerShown: true }} />
      <View style={[s.hero, { backgroundColor: c.cell }]}>
        <Text style={{ color: c.secondaryLabel, fontSize: 15 }}>Spent this month</Text>
        <Text style={[s.heroAmount, { color: c.label }]}>{formatMoney(302500, 'ILS')}</Text>
        <ProgressBar pct={63} color={budgetTone(63, c, pace)} pace={pace} />
        <Text style={[s.meta, { color: c.secondaryLabel }]}>Pace marker at {pace}% of the month</Text>
      </View>
      <Section title="Budgets">
        {SAMPLE.map((x, i) => {
          const pct = Math.round((x.spent * 100) / x.cap);
          return (
            <View key={x.name} style={s.budgetRow}>
              <CategoryIcon symbol={x.symbol} />
              <View style={[s.budgetBody, i < SAMPLE.length - 1 && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <View style={s.budgetTop}>
                  <Text style={{ color: c.label, fontSize: 17 }}>{x.name}</Text>
                  <Text style={[s.meta, { color: c.secondaryLabel }]}>
                    {formatMoney(x.spent, 'ILS')} / {formatMoney(x.cap, 'ILS')}
                  </Text>
                </View>
                <ProgressBar pct={pct} color={budgetTone(pct, c, pace)} pace={pace} />
              </View>
            </View>
          );
        })}
      </Section>
      <Section title="Rows and badges">
        <Row left={<CategoryIcon symbol="banknote" />} title="Savings" value={formatMoney(1240000, 'ILS')} onPress={() => {}} />
        <Row left={<CategoryIcon symbol="tray.full" />} title="To Review" right={<Badge text="2" color={c.orange} />} onPress={() => {}} last />
      </Section>
      <View style={s.actions}>
        <Button title="Save" onPress={() => {}} />
        <Button title="Archive Category" kind="destructive" onPress={() => {}} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { marginHorizontal: 16, marginTop: 12, borderRadius: radius.hero, padding: 18, gap: 8 },
  heroAmount: { fontSize: 40, fontWeight: '700', ...moneyText },
  meta: { fontSize: 14, ...moneyText },
  budgetRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 12 },
  budgetBody: { flex: 1, paddingVertical: 12, paddingRight: 16, gap: 8 },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  actions: { marginHorizontal: 16, marginTop: 24, gap: 8 },
});
