import { Redirect, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { BudgetRow } from '@/components/budget-row';
import { SwipeRow } from '@/components/swipe-row';
import { useToast } from '@/components/toast';
import { IncomePlanCard } from '@/components/income-plan';
import { Badge, Button, CategoryIcon, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { daysToGo, perDay } from '@/lib/budget';
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
const CAP = SAMPLE.reduce((n, x) => n + x.cap, 0);
const SPENT = SAMPLE.reduce((n, x) => n + x.spent, 0);

export default function DevPreview() {
  const c = useColors();
  const toast = useToast();
  if (!__DEV__) return <Redirect href="/" />;
  const pace = monthPace();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Design preview', headerShown: true }} />
      <View style={[s.hero, { backgroundColor: c.cell }]}>
        <Text style={{ color: c.secondaryLabel, fontSize: 15 }}>Left this month</Text>
        <Text style={[s.heroAmount, { color: budgetTone(Math.round((SPENT * 100) / CAP), c, pace) }]}>{formatMoney(CAP - SPENT, 'ILS')}</Text>
        <ProgressBar pct={Math.round((SPENT * 100) / CAP)} color={budgetTone(Math.round((SPENT * 100) / CAP), c, pace)} pace={pace} />
        <View style={s.heroRow}>
          <Text style={[s.meta, { color: c.secondaryLabel }]}>
            {formatMoney(SPENT, 'ILS')} of {formatMoney(CAP, 'ILS')}
          </Text>
          <Text style={[s.meta, { color: c.secondaryLabel }]}>
            ≈ {formatMoney(perDay(CAP - SPENT), 'ILS')} a day · {daysToGo()} days to go
          </Text>
        </View>
      </View>
      <Section title="Budgets">
        {SAMPLE.map((x, i) => (
          <SwipeRow
            key={x.name}
            onEdit={() => toast({ message: `Edit ${x.name}` })}
            onDelete={() => toast({ message: `${x.name} deleted`, action: { label: 'Undo', onPress: () => {} } })}>
            {(open) => (
              <BudgetRow name={x.name} symbol={x.symbol} cap={x.cap} spent={x.spent} currency="ILS" pace={pace} onPress={() => {}} onLongPress={open} last={i === SAMPLE.length - 1} />
            )}
          </SwipeRow>
        ))}
      </Section>
      <Section title="Without a budget">
        <BudgetRow name="Pets" symbol="pawprint" cap={null} spent={34000} currency="ILS" onPress={() => {}} />
        <BudgetRow name="Gifts" symbol="gift" cap={null} spent={12000} noBudget currency="ILS" onPress={() => {}} last />
      </Section>
      {/* Income plan: healthy, thin savings, over-assigned, not set */}
      <IncomePlanCard income={1800000} budgeted={CAP} currency="ILS" onPress={() => {}} />
      <IncomePlanCard income={CAP + 30000} budgeted={CAP} currency="ILS" onPress={() => {}} />
      <IncomePlanCard income={CAP - 60000} budgeted={CAP} currency="ILS" />
      <IncomePlanCard income={null} budgeted={CAP} currency="ILS" onPress={() => {}} />
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
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12, rowGap: 2 },
  actions: { marginHorizontal: 16, marginTop: 24, gap: 8 },
});
