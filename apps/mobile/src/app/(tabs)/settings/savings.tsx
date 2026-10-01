import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAddSavingsEntry, useHousehold, useOverview, useSavingsLedger } from '@/api/queries';
import { Button, ErrorText, Field, Row, Screen, Section } from '@/components/ui';
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
  const cur = useHousehold().data?.household?.base_currency ?? 'ILS';
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const minor = parseMoneyInput(amount);
  const entries = ledger.data ?? [];
  // What month close will move: what the budgets don't use, plus income never put in a budget.
  const o = overview.data;
  const coming = o ? o.net + (o.unassigned ?? 0) : 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: t.overview.savings, headerLargeTitle: false }} />
      <View style={[s.hero, { backgroundColor: c.cell }]}>
        <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>{t.savings.balance}</Text>
        <Text style={[s.heroAmount, { color: c.label }]}>{formatMoney(overview.data?.savings_balance ?? 0, cur)}</Text>
        {o && (o.total_cap > 0 || o.income != null) ? (
          <Text style={[s.heroMeta, { color: coming >= 0 ? c.green : c.red }]}>
            {t.savings.onTheWay(formatMoney(coming, cur, { sign: true }))}
          </Text>
        ) : null}
      </View>

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
});
