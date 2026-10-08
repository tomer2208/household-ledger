import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCloseGoal, useGoals, useHousehold, useMoveGoal, useSaveGoal } from '@/api/queries';
import type { Goal } from '@/api/types';
import { useToast } from '@/components/toast';
import { GoalLine } from '@/components/goal-line';
import { Button, CategoryIcon, ErrorText, Field, ProgressBar, Screen, Section } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { addMonths, currentMonth, monthLabel } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { formatMoney, minorToInput, parseMoneyInput } from '@/lib/money';
import { moneyText, useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';
import { Pressable } from '@/components/pressable';

const SYMBOLS = ['star', 'airplane', 'car', 'house', 'gift', 'graduationcap', 'heart', 'laptopcomputer', 'figure.and.child.holdinghands', 'cross.case'];

// P1-15: one savings goal. New: name, amount, by when, icon. Existing: the same, plus setting
// money aside for it (from free savings) or releasing it, and closing it.
export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goals = useGoals();
  if (id && !goals.data) return <Screen />;
  const goal = goals.data?.goals.find((g) => g.id === id);
  return <Editor key={goal?.id ?? 'new'} goal={goal} free={goals.data?.free ?? 0} />;
}

function Editor({ goal, free }: { goal?: Goal; free: number }) {
  const c = useColors();
  const toast = useToast();
  const cur = useHousehold().data?.household?.base_currency ?? 'ILS';
  const save = useSaveGoal();
  const move = useMoveGoal();
  const close = useCloseGoal();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? minorToInput(goal.target_minor) : '');
  const [month, setMonth] = useState<string | null>(goal?.target_month ?? null);
  const [symbol, setSymbol] = useState(goal?.sf_symbol ?? 'star');
  const [amount, setAmount] = useState('');
  const targetMinor = parseMoneyInput(target);
  const moveMinor = parseMoneyInput(amount);
  const now = currentMonth();
  // the next three years, starting this month
  const months = Array.from({ length: 36 }, (_, i) => addMonths(now, i));

  async function onSave() {
    if (!targetMinor || !name.trim()) return;
    await save.mutateAsync({ id: goal?.id, name: name.trim(), symbol, targetMinor, targetMonth: month });
    if (!goal) router.back();
    else toast({ message: t.merchants.saved });
  }

  function onMove(sign: 1 | -1) {
    if (!goal || !moveMinor) return;
    move.mutate(
      { id: goal.id, amountMinor: sign * moveMinor },
      { onSuccess: () => setAmount(''), onError: (e) => toast({ message: errorMessage(e) }) },
    );
  }

  async function onClose() {
    if (!goal) return;
    if (!(await confirm(t.goals.closeTitle(goal.name), t.goals.closeMessage(formatMoney(goal.saved, cur)), t.goals.closeAction))) return;
    await close.mutateAsync(goal.id);
    toast({ message: t.goals.closed(goal.name) });
    router.back();
  }

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[s.chip, { backgroundColor: selected ? c.tint : c.cell }]}>
      <Text style={[s.chipText, { color: selected ? c.onTint : c.label }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: goal ? goal.name : t.goals.newTitle, headerLargeTitle: false }} />
      {goal ? (
        <View style={[s.hero, { backgroundColor: c.cell }]}>
          <Text style={[s.heroAmount, { color: c.label }]}>{t.goals.progress(formatMoney(goal.saved, cur), formatMoney(goal.target_minor, cur))}</Text>
          <ProgressBar pct={Math.round((goal.saved * 100) / goal.target_minor)} color={goal.done ? c.green : c.tint} />
          <GoalLine goal={goal} currency={cur} />
        </View>
      ) : null}

      <Section>
        <Field label={t.goals.name} value={name} onChangeText={setName} maxLength={40} placeholder={t.goals.namePlaceholder} />
        <Field label={t.goals.target} value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0" last />
      </Section>

      <Text style={[s.label, { color: c.secondaryLabel }]}>{t.goals.when}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {chip(t.goals.noDate, month == null, () => setMonth(null))}
        {months.map((m) => chip(monthLabel(m), month === m, () => setMonth(m)))}
      </ScrollView>

      <Text style={[s.label, { color: c.secondaryLabel }]}>{t.goals.icon}</Text>
      <View style={s.symbols}>
        {SYMBOLS.map((sym) => (
          <Pressable
            key={sym}
            onPress={() => setSymbol(sym)}
            accessibilityRole="button"
            accessibilityLabel={sym}
            accessibilityState={{ selected: symbol === sym }}
            style={[s.symbol, symbol === sym && { backgroundColor: c.fill }]}>
            <CategoryIcon symbol={sym} size={36} />
          </Pressable>
        ))}
      </View>

      <ErrorText error={save.error} />
      <View style={s.actions}>
        <Button title={t.common.save} onPress={onSave} loading={save.isPending} disabled={!targetMinor || !name.trim()} />
      </View>

      {goal ? (
        <>
          <Section title={t.goals.setAside} footer={t.goals.freeNow(formatMoney(free, cur))}>
            <Field label={t.detail.amount(cur)} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" last />
          </Section>
          <View style={[s.actions, s.moveRow]}>
            <Button title={t.goals.deposit} onPress={() => onMove(1)} disabled={!moveMinor} loading={move.isPending} style={{ flex: 1 }} />
            <Button title={t.goals.release} kind="plain" onPress={() => onMove(-1)} disabled={!moveMinor || goal.saved <= 0} style={{ flex: 1 }} />
          </View>
          <View style={s.danger}>
            <Button title={t.goals.close} kind="destructive" onPress={onClose} loading={close.isPending} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 20, gap: 8 },
  heroAmount: { fontSize: 22, fontWeight: '700', ...moneyText },
  label: { fontFamily: fontFamily.body, fontSize: 13, marginTop: 24, marginBottom: 8, marginStart: 32 },
  chips: { gap: 8, paddingHorizontal: 16 },
  chip: { paddingHorizontal: 16, minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
  symbols: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginHorizontal: 16 },
  symbol: { padding: 6, borderRadius: 10 },
  actions: { marginHorizontal: 16, marginTop: 16 },
  moveRow: { flexDirection: 'row', gap: 12 },
  danger: { marginHorizontal: 16, marginTop: 32 },
});
