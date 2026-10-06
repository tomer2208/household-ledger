import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useCategories, useCategoryTrend, useHousehold, useOverview, useSaveCategory, useSetBudget } from '@/api/queries';
import type { Fund } from '@/api/types';
import { BudgetBreakdown } from '@/components/budget-breakdown';
import { CategoryTrend } from '@/components/charts';
import { Button, CategoryIcon, ErrorText, Field, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { budgetStatus, incomePlan } from '@/lib/budget';
import { useCategoryActions } from '@/lib/category-actions';
import { monthPace } from '@/lib/dates';
import { t } from '@/lib/i18n';
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
  const actions = useCategoryActions(hh.data?.household?.id);
  const trend = useCategoryTrend(id);
  const cat = cats.data?.find((x) => x.id === id);
  const current = overview.data?.categories.find((x) => x.id === id);

  const [name, setName] = useState(cat?.name ?? '');
  const [symbol, setSymbol] = useState(cat?.sf_symbol ?? 'tag');
  // The budget that was set; what carried in from last month (P1-14) comes on top of it.
  const baseCap = current?.base_cap ?? null;
  const carry = current?.carry ?? 0;
  const reserve = current?.reserve ?? 0;
  const [cap, setCap] = useState(baseCap ? minorToInput(baseCap) : '');
  const [rollover, setRollover] = useState(cat?.rollover ?? false);
  const [overspend, setOverspend] = useState(cat?.rollover_overspend ?? true);

  const householdId = hh.data?.household?.id;
  const capMinor = cap.trim() === '' ? null : parseMoneyInput(cap) ?? (cap.trim() === '0' ? 0 : null);
  // The household plan with this budget swapped in: budgets come out of income.
  const o = overview.data;
  const plan = incomePlan(o?.income, (o?.total_base_cap ?? 0) - (baseCap ?? 0) + (capMinor ?? 0));
  const cur = hh.data?.household?.base_currency ?? 'ILS';

  async function onSave() {
    if (!householdId || !name.trim()) return;
    await save.mutateAsync({
      id,
      householdId,
      name: name.trim(),
      sfSymbol: symbol,
      acknowledge: !!id,
      ...(id ? { rollover, rolloverOverspend: overspend } : {}),
    });
    if (id && capMinor != null && capMinor !== baseCap) {
      await setBudget.mutateAsync({ categoryId: id, capMinor });
    }
    router.back();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? t.categories.editTitle : t.categories.newTitle, headerLargeTitle: false }} />
      <View style={s.preview}>
        <CategoryIcon symbol={symbol} size={64} />
      </View>
      {id && current ? (
        <MonthStatus
          cap={capMinor}
          carry={carry}
          reserve={reserve}
          funds={current.funds}
          spent={current.spent}
          currency={cur}
          preview={capMinor !== baseCap}
        />
      ) : null}
      {/* P1-11: the last six months; a month opens its expenses here. */}
      {id && trend.data ? (
        <CategoryTrend
          months={trend.data}
          currency={cur}
          onMonth={(mo) => router.push({ pathname: '/transactions', params: { category: id, month: mo } })}
        />
      ) : null}
      <Section>
        <Field label={t.review.name} value={name} onChangeText={setName} maxLength={30} placeholder={t.categories.namePlaceholder} last={!id} />
        {id ? (
          <Field label={t.categories.monthlyBudget} value={cap} onChangeText={setCap} keyboardType="decimal-pad" placeholder={t.overview.noBudget} last />
        ) : null}
      </Section>
      {id && plan.kind !== 'none' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[s.hint, { color: plan.health === 'over' ? c.red : plan.health === 'thin' ? c.orange : c.secondaryLabel }]}>
          {plan.kind === 'over'
            ? t.categories.planOver(formatMoney(-plan.unassigned, cur), formatMoney(plan.income, cur))
            : t.categories.planLeft(formatMoney(plan.unassigned, cur), formatMoney(plan.income, cur), plan.savingsPct)}
        </Text>
      ) : null}
      {/* P1-14: what's left at month end stays with this category. */}
      {id ? (
        <Section footer={rollover ? `${t.categories.rolloverFooter} ${t.categories.rolloverOverspendFooter}` : t.categories.rolloverFooter}>
          <Row
            title={t.categories.rollover}
            right={<Switch value={rollover} onValueChange={setRollover} accessibilityLabel={t.categories.rollover} />}
            last={!rollover}
          />
          {rollover ? (
            <Row
              title={t.categories.rolloverOverspend}
              right={<Switch value={overspend} onValueChange={setOverspend} accessibilityLabel={t.categories.rolloverOverspend} />}
              last
            />
          ) : null}
        </Section>
      ) : null}
      {id && cat && !cat.budget_acknowledged ? (
        <Text style={[s.hint, { color: c.secondaryLabel }]}>
          {t.categories.fromShortcut}
        </Text>
      ) : null}

      <Text style={[s.label, { color: c.secondaryLabel }]}>{t.categories.icon}</Text>
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
        <Button title={t.common.save} onPress={onSave} loading={save.isPending || setBudget.isPending} disabled={!name.trim()} />
      </View>
      {/* Kept apart from Save so the destructive action is never a mis-tap away. */}
      {id && cat ? (
        <View style={s.danger}>
          {cat.archived_at ? (
            <Button
              title={t.categories.restore}
              kind="plain"
              onPress={async () => {
                await save.mutateAsync({ id, householdId: householdId!, name: cat.name, sfSymbol: cat.sf_symbol, archived: false });
                router.back();
              }}
            />
          ) : (
            <Button
              title={t.categories.deleteCategory}
              kind="destructive"
              onPress={async () => {
                if (await actions.remove(cat)) router.back();
              }}
            />
          )}
        </View>
      ) : null}
    </Screen>
  );
}

// This month under the budget being typed: the effect of a change is visible before saving.
function MonthStatus({
  cap,
  carry,
  reserve,
  funds,
  spent,
  currency,
  preview,
}: {
  cap: number | null;
  carry: number;
  reserve: number;
  funds: Fund[];
  spent: number;
  currency: string;
  preview: boolean;
}) {
  const c = useColors();
  const pace = monthPace();
  // the month's budget: the one being typed, plus what carried in and what spread payments
  // set aside or release
  const st = budgetStatus(cap == null && carry === 0 && reserve === 0 ? null : (cap ?? 0) + carry + reserve, spent);
  const tone = st.kind === 'none' ? c.label : budgetTone(st.pct, c, pace);
  return (
    <View style={[s.status, { backgroundColor: c.cell }]} accessibilityLiveRegion="polite">
      <Text style={[s.statusLabel, { color: c.secondaryLabel }]}>{preview ? t.categories.withNewBudget : t.month.thisMonth}</Text>
      {st.kind === 'none' ? (
        <Text style={[s.statusAmount, { color: tone }]}>{t.budget.spent(formatMoney(spent, currency))}</Text>
      ) : (
        <>
          <Text style={[s.statusAmount, { color: tone }]}>
            {st.kind === 'left' ? t.budget.left(formatMoney(st.amount, currency)) : t.budget.over(formatMoney(st.amount, currency))}
          </Text>
          <ProgressBar pct={st.pct} color={tone} pace={pace} />
          <Text style={[s.statusMeta, { color: c.secondaryLabel }]}>
            {t.common.of(formatMoney(st.spent, currency), formatMoney(st.cap, currency))}
          </Text>
          <BudgetBreakdown base={cap ?? 0} carry={carry} reserve={reserve} funds={funds} currency={currency} align="start" />
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
  label: { fontSize: 13, marginStart: 32, marginTop: 22, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, borderRadius: 10, padding: 8 },
  symbol: { width: '16.66%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  actions: { marginHorizontal: 16, marginTop: 24, gap: 8 },
  danger: { marginHorizontal: 16, marginTop: 32 },
});
