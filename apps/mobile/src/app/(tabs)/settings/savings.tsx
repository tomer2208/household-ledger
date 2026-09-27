import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAddSavingsEntry, useHousehold, useOverview, useSavingsLedger } from '@/api/queries';
import { Button, ErrorText, Field, Row, Screen, Section } from '@/components/ui';
import { monthLabel, shortDate } from '@/lib/dates';
import { formatMoney, parseMoneyInput } from '@/lib/money';
import { useColors } from '@/lib/theme';

const TYPE_LABEL = { month_close: 'Month close', late_adjustment: 'Late change', manual: 'Manual' } as const;

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

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Savings', headerLargeTitle: false }} />
      <View style={[s.hero, { backgroundColor: c.cell }]}>
        <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>Balance</Text>
        <Text style={[s.heroAmount, { color: c.label }]}>{formatMoney(overview.data?.savings_balance ?? 0, cur)}</Text>
        {overview.data && overview.data.total_cap > 0 ? (
          <Text style={[s.heroMeta, { color: overview.data.net >= 0 ? c.green : c.red }]}>
            {overview.data.net >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(overview.data.net), cur)} on the way this month
          </Text>
        ) : null}
      </View>

      <Section title="Manual entry" footer="Use this when you actually spend savings (a trip) or top them up.">
        <View style={s.toggle}>
          {(['out', 'in'] as const).map((d) => (
            <Pressable key={d} onPress={() => setDirection(d)} style={[s.toggleItem, { backgroundColor: direction === d ? c.tint : c.fill }]}>
              <Text style={{ color: direction === d ? '#fff' : c.label, fontWeight: '600' }}>{d === 'out' ? 'Withdraw' : 'Deposit'}</Text>
            </Pressable>
          ))}
        </View>
        <Field label={`Amount (${cur})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Summer trip" last />
      </Section>
      <View style={s.actions}>
        <Button
          title={direction === 'out' ? 'Withdraw' : 'Deposit'}
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
        <Section title="History">
          {entries.map((e, i) => (
            <Row
              key={e.id}
              title={e.reason}
              subtitle={`${TYPE_LABEL[e.entry_type]} · ${e.entry_type === 'month_close' ? monthLabel(e.budget_month) : shortDate(e.created_at)}`}
              right={
                <Text style={{ color: e.amount_minor >= 0 ? c.green : c.red, fontSize: 17, fontVariant: ['tabular-nums'] }}>
                  {e.amount_minor >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(e.amount_minor), cur)}
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
  heroAmount: { fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroMeta: { fontSize: 14, fontVariant: ['tabular-nums'] },
  toggle: { flexDirection: 'row', gap: 8, padding: 12 },
  toggleItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, minHeight: 36 },
  actions: { marginHorizontal: 16, marginTop: 16 },
});
