import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCategories, useHousehold, useOverview, useSaveCategory, useSetBudget } from '@/api/queries';
import { Button, CategoryIcon, ErrorText, Field, ProgressBar, Screen, Section } from '@/components/ui';
import { budgetStatus } from '@/lib/budget';
import { monthPace } from '@/lib/dates';
import { formatMoney, minorToInput, parseMoneyInput } from '@/lib/money';
import { budgetTone, moneyText, radius, useColors } from '@/lib/theme';

const SYMBOLS = [
  'cart', 'fork.knife', 'cup.and.saucer', 'car', 'fuelpump', 'bus', 'house', 'bolt', 'drop', 'wifi',
  'cross.case', 'pills', 'figure.and.child.holdinghands', 'pawprint', 'bag', 'tshirt', 'popcorn', 'gamecontroller',
  'arrow.triangle.2.circlepath', 'airplane', 'gift', 'graduationcap', 'dumbbell', 'scissors', 'wrench.and.screwdriver',
  'creditcard', 'building.columns', 'heart', 'tag', 'ellipsis.circle',
];

export default function CategoryEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const cats = useCategories();
  const overview = useOverview();
  if (id && (!cats.data || !overview.data)) return <Screen />;
  return <Editor id={id} />;
}

function Editor({ id }: { id?: string }) {
  const c = useColors();
  const hh = useHousehold();
  const cats = useCategories();
  const overview = useOverview();
  const save = useSaveCategory();
  const setBudget = useSetBudget();
  const cat = cats.data?.find((x) => x.id === id);
  const current = overview.data?.categories.find((x) => x.id === id);

  const [name, setName] = useState(cat?.name ?? '');
  const [symbol, setSymbol] = useState(cat?.sf_symbol ?? 'tag');
  const [cap, setCap] = useState(current?.cap ? minorToInput(current.cap) : '');

  const householdId = hh.data?.household?.id;
  const capMinor = cap.trim() === '' ? null : parseMoneyInput(cap) ?? (cap.trim() === '0' ? 0 : null);

  async function onSave() {
    if (!householdId || !name.trim()) return;
    await save.mutateAsync({ id, householdId, name: name.trim(), sfSymbol: symbol, acknowledge: !!id });
    if (id && capMinor != null && capMinor !== (current?.cap ?? null)) {
      await setBudget.mutateAsync({ categoryId: id, capMinor });
    }
    router.back();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Edit Category' : 'New Category', headerLargeTitle: false }} />
      <View style={s.preview}>
        <CategoryIcon symbol={symbol} size={64} />
      </View>
      {id && current ? (
        <MonthStatus
          cap={capMinor}
          spent={current.spent}
          currency={hh.data?.household?.base_currency ?? 'ILS'}
          preview={capMinor !== (current.cap ?? null)}
        />
      ) : null}
      <Section>
        <Field label="Name" value={name} onChangeText={setName} maxLength={30} placeholder="Pets" last={!id} />
        {id ? (
          <Field label="Monthly budget" value={cap} onChangeText={setCap} keyboardType="decimal-pad" placeholder="No budget" last />
        ) : null}
      </Section>
      {id && cat && !cat.budget_acknowledged ? (
        <Text style={[s.hint, { color: c.secondaryLabel }]}>
          Created from the Shortcut. Saving marks it as reviewed, with or without a budget.
        </Text>
      ) : null}

      <Text style={[s.label, { color: c.secondaryLabel }]}>ICON</Text>
      <View style={[s.grid, { backgroundColor: c.cell }]}>
        {SYMBOLS.map((sym) => (
          <Pressable
            key={sym}
            onPress={() => setSymbol(sym)}
            style={[s.symbol, symbol === sym && { backgroundColor: c.fill }]}
            accessibilityLabel={sym}>
            <CategoryIcon symbol={sym} size={36} />
          </Pressable>
        ))}
      </View>

      <ErrorText error={save.error ?? setBudget.error} />
      <View style={s.actions}>
        <Button title="Save" onPress={onSave} loading={save.isPending || setBudget.isPending} disabled={!name.trim()} />
        {id && cat ? (
          <Button
            title={cat.archived_at ? 'Restore Category' : 'Archive Category'}
            kind={cat.archived_at ? 'plain' : 'destructive'}
            onPress={async () => {
              await save.mutateAsync({ id, householdId: householdId!, name: cat.name, sfSymbol: cat.sf_symbol, archived: !cat.archived_at });
              router.back();
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

// This month under the budget being typed: the effect of a change is visible before saving.
function MonthStatus({ cap, spent, currency, preview }: { cap: number | null; spent: number; currency: string; preview: boolean }) {
  const c = useColors();
  const pace = monthPace();
  const st = budgetStatus(cap, spent);
  const tone = st.kind === 'none' ? c.label : budgetTone(st.pct, c, pace);
  return (
    <View style={[s.status, { backgroundColor: c.cell }]} accessibilityLiveRegion="polite">
      <Text style={[s.statusLabel, { color: c.secondaryLabel }]}>{preview ? 'This month, with the new budget' : 'This month'}</Text>
      {st.kind === 'none' ? (
        <Text style={[s.statusAmount, { color: tone }]}>{formatMoney(spent, currency)} spent</Text>
      ) : (
        <>
          <Text style={[s.statusAmount, { color: tone }]}>
            {formatMoney(st.amount, currency)} {st.kind}
          </Text>
          <ProgressBar pct={st.pct} color={tone} pace={pace} />
          <Text style={[s.statusMeta, { color: c.secondaryLabel }]}>
            {formatMoney(st.spent, currency)} of {formatMoney(st.cap, currency)}
          </Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  status: { marginHorizontal: 16, marginTop: 16, borderRadius: radius.hero, padding: 16, gap: 8 },
  statusLabel: { fontSize: 13 },
  statusAmount: { fontSize: 28, fontWeight: '700', ...moneyText },
  statusMeta: { fontSize: 13, ...moneyText },
  preview: { alignItems: 'center', marginTop: 16 },
  hint: { fontSize: 13, marginHorizontal: 32, marginTop: 6 },
  label: { fontSize: 13, marginLeft: 32, marginTop: 22, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, borderRadius: 10, padding: 8 },
  symbol: { width: '16.66%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  actions: { marginHorizontal: 16, marginTop: 24, gap: 8 },
});
