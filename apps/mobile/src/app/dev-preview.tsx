import { Redirect, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ADD_BUTTON_SPACE, AddButton } from '@/components/add-button';
import { Envelope, EnvelopeGrid } from '@/components/envelope';
import { SwipeRow } from '@/components/swipe-row';
import { useToast } from '@/components/toast';
import { IncomePlanCard } from '@/components/income-plan';
import { Badge, Button, CategoryIcon, Empty, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { daysToGo, perDay } from '@/lib/budget';
import { runsOutOn } from '@/lib/envelope';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { budgetTone, moneyText, radius, useColors } from '@/lib/theme';

// Dev builds only: the design system on sample data, so UI work can be checked in the
// web preview without signing in to a real household. Production redirects home.
// K1: the eight seeded envelopes in every state: fine, fine but running out early, close, over.
const SAMPLE = [
  { name: 'Groceries', symbol: 'cart', spent: 115000, cap: 320000 },
  { name: 'Eating out', symbol: 'fork.knife', spent: 61000, cap: 90000 },
  { name: 'Transport', symbol: 'car', spent: 38000, cap: 80000 },
  { name: 'Fuel', symbol: 'fuelpump', spent: 112000, cap: 100000 },
  { name: 'Housing', symbol: 'house', spent: 0, cap: 520000 },
  { name: 'Utilities', symbol: 'bolt', spent: 54000, cap: 65000 },
  { name: 'Health', symbol: 'cross.case', spent: 12000, cap: 40000 },
  { name: 'Kids', symbol: 'figure.and.child.holdinghands', spent: 52000, cap: 140000 },
];
const CAP = SAMPLE.reduce((n, x) => n + x.cap, 0);
const SPENT = SAMPLE.reduce((n, x) => n + x.spent, 0);

export default function DevPreview() {
  const c = useColors();
  const toast = useToast();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1 }}>
      <Screen bottomSpace={ADD_BUTTON_SPACE}>
        <Stack.Screen options={{ title: 'Design preview', headerShown: true }} />
        <View style={[s.hero, { backgroundColor: c.cell }]}>
          <Text style={{ color: c.secondaryLabel, fontSize: 15 }}>Left this month</Text>
          <Text style={[s.heroAmount, { color: c.text }]}>{formatMoney(CAP - SPENT, 'ILS')}</Text>
          <ProgressBar pct={Math.round((SPENT * 100) / CAP)} color={budgetTone(Math.round((SPENT * 100) / CAP), c)} />
          <View style={s.heroRow}>
            <Text style={[s.meta, { color: c.secondaryLabel }]}>
              {formatMoney(SPENT, 'ILS')} of {formatMoney(CAP, 'ILS')}
            </Text>
            <Text style={[s.meta, { color: c.secondaryLabel }]}>
              ≈ {formatMoney(perDay(CAP - SPENT), 'ILS')} a day · {daysToGo()} days to go
            </Text>
          </View>
        </View>
        <Text style={[s.group, { color: c.text }]}>{t.envelope.envelopes}</Text>
        <EnvelopeGrid>
          {SAMPLE.map((x) => {
            const out = runsOutOn(x.cap, x.spent, 12, 31);
            return (
              <Envelope
                key={x.name}
                name={x.name}
                symbol={x.symbol}
                cap={x.cap}
                spent={x.spent}
                currency="ILS"
                hint={out ? t.envelope.runsOut(out) : null}
                onPress={() => toast({ message: `Add to ${x.name}` })}
                onLongPress={() => toast({ message: `Edit ${x.name}` })}
              />
            );
          })}
        </EnvelopeGrid>
        <Text style={[s.group, { color: c.text }]}>Without a budget</Text>
        <EnvelopeGrid>
          <Envelope name="Pets" symbol="pawprint" cap={null} spent={34000} currency="ILS" onPress={() => {}} />
          <Envelope name="Gifts" symbol="gift" cap={null} spent={12000} currency="ILS" onPress={() => {}} />
        </EnvelopeGrid>
        {/* Income plan: healthy, thin savings, over-assigned, not set */}
        <SwipeRow
          onEdit={() => toast({ message: 'Edit income' })}
          onDelete={() => toast({ message: 'Monthly income removed', action: { label: 'Undo', onPress: () => {} } })}
          containerStyle={s.incomeSwipe}>
          {(open) => <IncomePlanCard income={1800000} budgeted={CAP} currency="ILS" onPress={() => {}} onLongPress={open} flush />}
        </SwipeRow>
        <IncomePlanCard income={CAP + 30000} budgeted={CAP} currency="ILS" onPress={() => {}} />
        <IncomePlanCard income={CAP - 60000} budgeted={CAP} currency="ILS" />
        <IncomePlanCard income={null} budgeted={CAP} currency="ILS" onPress={() => {}} />
        <Section title="Rows and badges">
          <Row left={<CategoryIcon symbol="banknote" />} title="Savings" value={formatMoney(1240000, 'ILS')} onPress={() => {}} />
          <Row left={<CategoryIcon symbol="tray.full" />} title="To Review" right={<Badge text="2" color={c.orange} />} onPress={() => {}} last />
        </Section>
        <Empty
          icon="chart.pie"
          title="Start with your budgets"
          message="Give each category a monthly budget, and this screen shows what’s left as you spend."
          action={{ label: 'Set Budgets', kind: 'plain', onPress: () => toast({ message: 'Set budgets' }) }}
        />
        <View style={s.actions}>
          <Button title="Save" onPress={() => {}} />
          <Button title="Archive Category" kind="destructive" onPress={() => {}} />
        </View>
      </Screen>
      <AddButton />
    </View>
  );
}

const s = StyleSheet.create({
  hero: { marginHorizontal: 16, marginTop: 12, borderRadius: radius.hero, padding: 18, gap: 8 },
  heroAmount: { fontSize: 40, fontWeight: '700', ...moneyText },
  meta: { fontSize: 14, ...moneyText },
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12, rowGap: 2 },
  actions: { marginHorizontal: 16, marginTop: 24, gap: 8 },
  group: { fontFamily: 'Secular One', fontSize: 19, marginHorizontal: 20, marginTop: 24, marginBottom: 8 },
  incomeSwipe: { marginHorizontal: 16, marginTop: 16, borderRadius: radius.hero, overflow: 'hidden' },
});
