import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAddSavingsEntry, useCategories, useGoals, useHousehold, useOverview, useSavingsLedger } from '@/api/queries';
import { GoalLine } from '@/components/goal-line';
import { Button, CategoryIcon, ErrorText, Field, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { headingToSavings } from '@/lib/budget';
import { monthLabel, shortDate } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { formatMoney, parseMoneyInput } from '@/lib/money';
import { moneyText, useColors } from '@/lib/theme';

// The server writes its own reasons in English ("Month close 2026-09"); entries it made
// itself are described here instead, in the app's language. Manual ones keep what was typed.
const LATE = /^Late change: /;
function reasonOf(e: { entry_type: keyof typeof t.savings.type; reason: string; budget_month: string }) {
  if (e.entry_type === 'month_close' || e.entry_type === 'unassigned_income') return `${t.savings.type[e.entry_type]} · ${monthLabel(e.budget_month)}`;
  if (e.entry_type === 'late_adjustment') return t.savings.lateChange(e.reason.replace(LATE, ''));
  return e.reason;
}

// Savings is a ledger, not a number that gets overwritten: every move has a reason (BLUEPRINT §3.3).
export default function SavingsScreen() {
  const c = useColors();
  const ledger = useSavingsLedger();
  const overview = useOverview();
  const add = useAddSavingsEntry();
  const goals = useGoals().data;
  const cur = useHousehold().data?.household?.base_currency ?? 'ILS';
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const minor = parseMoneyInput(amount);
  const entries = ledger.data ?? [];
  // What month close will move: what the budgets don't use, plus income never put in a budget,
  // less what rolls over to next month (P1-14).
  const o = overview.data;
  const cats = useCategories().data;
  const coming = o ? headingToSavings(o, (id) => cats?.find((x) => x.id === id)?.rollover_overspend ?? true) : 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: t.overview.savings, headerLargeTitle: false }} />
      <View style={[s.hero, { backgroundColor: c.cell }]}>
        <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>{t.savings.balance}</Text>
        <Text style={[s.heroAmount, { color: c.label }]}>{formatMoney(overview.data?.savings_balance ?? 0, cur)}</Text>
        {o && (o.total_base_cap > 0 || o.income != null) ? (
          <Text style={[s.heroMeta, { color: coming >= 0 ? c.green : c.red }]}>
            {t.savings.onTheWay(formatMoney(coming, cur, { sign: true }))}
          </Text>
        ) : null}
      </View>

      {/* P1-15: goals set part of the balance aside; the money stays in savings. */}
      <Section
        title={t.goals.title}
        footer={goals && goals.free < 0 ? t.goals.overAllocated(formatMoney(-goals.free, cur)) : t.goals.footer}
        action={{ label: t.goals.add, onPress: () => router.push('/settings/goal') }}>
        {goals && goals.goals.length > 0 ? (
          <>
            <Row title={t.goals.allocated(formatMoney(goals.allocated, cur), formatMoney(goals.free, cur))} titleStyle={{ fontSize: 15, color: goals.free < 0 ? c.red : c.secondaryLabel }} />
            {goals.goals.map((g, i) => (
              <Pressable
                key={g.id}
                onPress={() => router.push({ pathname: '/settings/goal', params: { id: g.id } })}
                accessibilityRole="button"
                style={({ pressed }) => [s.goal, i < goals.goals.length - 1 && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: c.fill }]}>
                <CategoryIcon symbol={g.sf_symbol} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={s.goalTop}>
                    <Text numberOfLines={1} style={[s.goalName, { color: c.label }]}>{g.name}</Text>
                    <Text style={[s.goalAmount, { color: c.secondaryLabel }]}>
                      {t.goals.progress(formatMoney(g.saved, cur), formatMoney(g.target_minor, cur))}
                    </Text>
                  </View>
                  <ProgressBar pct={Math.round((g.saved * 100) / g.target_minor)} color={g.done ? c.green : c.tint} />
                  <GoalLine goal={g} currency={cur} />
                </View>
              </Pressable>
            ))}
          </>
        ) : (
          <Row title={t.goals.add} onPress={() => router.push('/settings/goal')} chevron={false} last />
        )}
      </Section>

      <Section title={t.savings.manual} footer={t.savings.manualFooter}>
        <View style={s.toggle}>
          {(['out', 'in'] as const).map((d) => (
            <Pressable
              key={d}
              onPress={() => setDirection(d)}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              accessibilityState={{ selected: direction === d }}
              style={[s.toggleItem, { backgroundColor: direction === d ? c.tint : c.fill }]}>
              <Text style={{ color: direction === d ? c.onTint : c.label, fontWeight: '600' }}>{d === 'out' ? t.savings.withdraw : t.savings.deposit}</Text>
            </Pressable>
          ))}
        </View>
        <Field label={t.detail.amount(cur)} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        <Field label={t.savings.reason} value={reason} onChangeText={setReason} placeholder={t.savings.reasonPlaceholder} last />
      </Section>
      <View style={s.actions}>
        <Button
          title={direction === 'out' ? t.savings.withdraw : t.savings.deposit}
          disabled={!minor || !reason.trim()}
          loading={add.isPending}
          onPress={async () => {
            await add.mutateAsync({ amountMinor: direction === 'out' ? -minor! : minor!, reason: reason.trim() });
            setAmount('');
            setReason('');
          }}
        />
      </View>
      <ErrorText error={add.error} />

      {entries.length > 0 ? (
        <Section title={t.savings.history}>
          {entries.map((e, i) => (
            <Row
              key={e.id}
              title={reasonOf(e)}
              subtitle={e.entry_type === 'manual' ? `${t.savings.type.manual} · ${shortDate(e.created_at)}` : shortDate(e.created_at)}
              right={
                <Text style={{ color: e.amount_minor >= 0 ? c.green : c.red, fontSize: 17, ...moneyText }}>
                  {formatMoney(e.amount_minor, cur, { sign: true })}
                </Text>
              }
              last={i === entries.length - 1}
            />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 18, gap: 4 },
  heroLabel: { fontSize: 15 },
  heroAmount: { fontSize: 36, fontWeight: '700', ...moneyText },
  heroMeta: { fontSize: 14, fontVariant: ['tabular-nums'] },
  toggle: { flexDirection: 'row', gap: 8, padding: 12 },
  toggleItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, minHeight: 36 },
  actions: { marginHorizontal: 16, marginTop: 16 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  goalTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  goalName: { fontSize: 17, flexShrink: 1 },
  goalAmount: { fontSize: 14, ...moneyText },
});
