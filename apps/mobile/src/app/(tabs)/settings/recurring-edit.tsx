import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useCategories, useDeleteRecurring, useHousehold, useRecurring, useSaveRecurring } from '@/api/queries';
import type { RecurringRule } from '@/api/types';
import { CategoryPicker } from '@/components/category-picker';
import { Button, ErrorText, Field, Screen, Section } from '@/components/ui';
import { CURRENCIES, minorToInput, parseMoneyInput } from '@/lib/money';
import { useColors } from '@/lib/theme';

const INTERVALS = [
  { v: 1, label: 'Monthly' },
  { v: 2, label: '2 mo' },
  { v: 3, label: '3 mo' },
  { v: 6, label: '6 mo' },
  { v: 12, label: 'Yearly' },
];

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function RecurringEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const rules = useRecurring();
  if (id && !rules.data) return <Screen />;
  return <Editor id={id} rule={rules.data?.find((r) => r.id === id)} />;
}

function Editor({ id, rule }: { id?: string; rule?: RecurringRule }) {
  const c = useColors();
  const hh = useHousehold();
  const cats = useCategories();
  const save = useSaveRecurring();
  const del = useDeleteRecurring();
  const base = hh.data?.household?.base_currency ?? 'ILS';

  const [title, setTitle] = useState(rule?.title ?? '');
  const [amount, setAmount] = useState(rule ? minorToInput(rule.amount_minor) : '');
  const [currency, setCurrency] = useState(rule?.currency ?? base);
  const [estimated, setEstimated] = useState(rule?.amount_kind === 'estimated');
  const [interval, setInterval] = useState(rule?.interval_months ?? 1);
  const [day, setDay] = useState(String(rule?.day_of_month ?? new Date().getDate()));
  const [startDate, setStartDate] = useState(rule?.start_date ?? todayYmd());
  const [paused, setPaused] = useState(rule?.paused ?? false);
  const [categoryId, setCategoryId] = useState<string | null>(rule?.category_id ?? null);

  const minor = parseMoneyInput(amount);
  const dayNum = Number(day);
  const valid = !!title.trim() && !!minor && !!categoryId && dayNum >= 1 && dayNum <= 31 && /^\d{4}-\d{2}-\d{2}$/.test(startDate);

  async function onSave() {
    if (!valid || !hh.data?.household) return;
    await save.mutateAsync({
      id,
      householdId: hh.data.household.id,
      title: title.trim(),
      categoryId: categoryId!,
      amountMinor: minor!,
      currency,
      amountKind: estimated ? 'estimated' : 'fixed',
      intervalMonths: interval,
      dayOfMonth: dayNum,
      startDate,
      paused,
    });
    router.back();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Edit Recurring' : 'New Recurring', headerLargeTitle: false }} />
      <Section>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Rent, Netflix, Electricity" />
        <Field label={`Amount (${currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        <View style={s.row}>
          <Text style={[s.rowLabel, { color: c.label }]}>Variable bill (estimate)</Text>
          <Switch value={estimated} onValueChange={setEstimated} />
        </View>
        <View style={[s.chips, { paddingBottom: 12 }]}>
          {CURRENCIES.map((cur) => (
            <Chip key={cur} label={cur} on={currency === cur} onPress={() => setCurrency(cur)} />
          ))}
        </View>
      </Section>

      <Section title="Schedule" footer="Day 31 falls on the last day of shorter months.">
        <View style={[s.chips, { paddingTop: 12 }]}>
          {INTERVALS.map((i) => (
            <Chip key={i.v} label={i.label} on={interval === i.v} onPress={() => setInterval(i.v)} />
          ))}
        </View>
        <Field label="Day of month" value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} />
        <Field label="Starts" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <View style={s.row}>
          <Text style={[s.rowLabel, { color: c.label }]}>Paused</Text>
          <Switch value={paused} onValueChange={setPaused} />
        </View>
      </Section>

      <Text style={[s.label, { color: c.secondaryLabel }]}>CATEGORY</Text>
      <CategoryPicker categories={cats.data ?? []} value={categoryId} onChange={setCategoryId} />

      <ErrorText error={save.error ?? del.error} />
      <View style={s.actions}>
        <Button title="Save" onPress={onSave} disabled={!valid} loading={save.isPending} />
        {id ? (
          <Button
            title="Delete Recurring"
            kind="destructive"
            onPress={async () => {
              await del.mutateAsync(id);
              router.back();
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={[s.chip, { backgroundColor: on ? c.tint : c.fill }]}>
      <Text style={{ color: on ? c.onTint : c.label, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 50 },
  rowLabel: { fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, minHeight: 34, justifyContent: 'center' },
  label: { fontSize: 13, marginLeft: 32, marginTop: 22, marginBottom: 8 },
  actions: { marginHorizontal: 16, marginTop: 24, gap: 8 },
});
