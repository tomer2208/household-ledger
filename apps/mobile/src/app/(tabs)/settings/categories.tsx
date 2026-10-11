import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useCategories, useHousehold, useOverview, useSaveCategory } from '@/api/queries';
import type { Category } from '@/api/types';
import { BudgetRow } from '@/components/budget-row';
import { DragList } from '@/components/drag-list';
import { IncomePlanCard } from '@/components/income-plan';
import { SwipeRow } from '@/components/swipe-row';
import { Button, CategoryIcon, Icon, Row, Screen, Section } from '@/components/ui';
import { useCategoryActions } from '@/lib/category-actions';
import { useIncomeActions } from '@/lib/income-actions';
import { monthPace } from '@/lib/dates';
import { lang, t } from '@/lib/i18n';
import { translatedSeedName } from '@/lib/seed-names';
import { radius, tokens, useColors } from '@/lib/theme';
import { Pressable } from '@/components/pressable';

export default function CategoriesScreen() {
  const c = useColors();
  const cats = useCategories();
  const overview = useOverview();
  const household = useHousehold().data?.household;
  const cur = household?.base_currency ?? 'ILS';
  const capById = new Map((overview.data?.categories ?? []).map((x) => [x.id, x]));
  const serverActive = (cats.data ?? []).filter((x) => !x.archived_at && !x.hidden);
  // While ordering, the new order shows at once instead of waiting for the saves to come back.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const active = localOrder
    ? [...serverActive].sort((a, b) => (localOrder.indexOf(a.id) + 1 || 999) - (localOrder.indexOf(b.id) + 1 || 999))
    : serverActive;
  const hiddenOnes = (cats.data ?? []).filter((x) => !x.archived_at && x.hidden);
  const save = useSaveCategory();
  const [ordering, setOrdering] = useState(false);
  // P2: order by dragging, or with up/down buttons (WCAG 2.5.7: no dragging needed). Every move
  // gives each category a fresh, even sort order, so equal numbers never tie.
  const move = (from: number, to: number) => {
    if (!household || to < 0 || to >= active.length || from === to) return;
    const next = [...active];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLocalOrder(next.map((x) => x.id));
    next.forEach((cat, i) => {
      const order = (i + 1) * 10;
      if (cat.sort_order !== order) save.mutate({ id: cat.id, householdId: household.id, name: cat.name, sfSymbol: cat.sf_symbol, sortOrder: order });
    });
  };
  // D1 / P2: seeded names still in the other language
  const to = lang() === 'he' ? 'he' : 'en';
  const foreign = (cats.data ?? []).filter((x) => x.created_via === 'seed' && translatedSeedName(x.name, to));
  const translate = () =>
    household &&
    foreign.forEach((x: Category) =>
      save.mutate({ id: x.id, householdId: household.id, name: translatedSeedName(x.name, to)!, sfSymbol: x.sf_symbol }),
    );
  const archived = (cats.data ?? []).filter((x) => x.archived_at);
  const pace = monthPace();
  const edit = (id: string) => router.push({ pathname: '/settings/category', params: { id } });
  const actions = useCategoryActions(household?.id);
  const income = useIncomeActions();

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: t.categories.title,
          headerLargeTitle: false,
          headerRight: () => (
            <View style={s.headActions}>
              <Pressable
                onPress={() => {
                  setOrdering((x) => !x);
                  setLocalOrder(null);
                }} hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: ordering }}>
                <Text style={[s.headAction, { color: c.tint }]}>{ordering ? t.categories.orderDone : t.categories.order}</Text>
              </Pressable>
              {ordering ? null : (
                <Pressable onPress={() => router.push('/settings/category')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.categories.addA11y}>
                  <Text style={[s.headAction, { color: c.tint }]}>{t.categories.add}</Text>
                </Pressable>
              )}
            </View>
          ),
        }}
      />
      {overview.data?.income ? (
        <SwipeRow onEdit={income.edit} onDelete={income.remove} containerStyle={s.incomeSwipe}>
          {(open) => (
            <IncomePlanCard
              income={overview.data!.income}
              budgeted={overview.data!.total_base_cap}
              currency={cur}
              onPress={income.edit}
              onLongPress={open}
              actions={[
                { name: 'edit', label: t.categories.editIncome, run: income.edit },
                { name: 'delete', label: t.categories.removeIncome, run: income.remove },
              ]}
              flush
            />
          )}
        </SwipeRow>
      ) : overview.data ? (
        <IncomePlanCard income={null} budgeted={overview.data.total_base_cap} currency={cur} onPress={income.edit} />
      ) : null}
      {foreign.length > 0 ? (
        <View style={[s.translate, { backgroundColor: c.cell }]}>
          <Text style={[s.translateTitle, { color: c.text }]}>{t.categories.translateTitle}</Text>
          <Text style={[s.translateBody, { color: c.text2 }]}>{t.categories.translateBody(foreign.length)}</Text>
          <Button title={t.categories.translate} kind="plain" onPress={translate} loading={save.isPending} />
        </View>
      ) : null}
      {!ordering && active.length > 0 ? (
        <Section>
          <Row left={<CategoryIcon symbol="pencil" />} title={t.budgets.open} onPress={() => router.push('/settings/budgets')} last />
        </Section>
      ) : null}
      {ordering ? (
        <Section title={t.categories.order} footer={t.categories.orderFooter}>
          <DragList
            items={active}
            keyOf={(cat) => cat.id}
            onMove={move}
            liftColor={c.cell}
            renderItem={(cat, i, handle) => (
            <View style={[s.orderRow, i < active.length - 1 && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              {handle}
              <CategoryIcon symbol={cat.sf_symbol} categoryId={cat.id} />
              <Text style={[s.orderName, { color: c.text }]} numberOfLines={1}>
                {cat.name}
              </Text>
              <Pressable onPress={() => move(i, i - 1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel={t.categories.moveUp(cat.name)} style={[s.orderBtn, { opacity: i === 0 ? 0.3 : 1 }]}>
                <Icon name="chevron.up" size={18} color={c.text} />
              </Pressable>
              <Pressable onPress={() => move(i, i + 1)} disabled={i === active.length - 1} accessibilityRole="button" accessibilityLabel={t.categories.moveDown(cat.name)} style={[s.orderBtn, { opacity: i === active.length - 1 ? 0.3 : 1 }]}>
                <Icon name="chevron.down" size={18} color={c.text} />
              </Pressable>
            </View>
            )}
          />
        </Section>
      ) : (
      <Section
        title={t.month.thisMonth}
        footer={t.categories.footer}>
        {active.map((cat, i) => {
          const o = capById.get(cat.id);
          return (
            <SwipeRow key={cat.id} onEdit={() => actions.edit(cat)} onDelete={() => actions.remove(cat)}>
              {(open) => (
                <BudgetRow
                  name={cat.name}
                  symbol={cat.sf_symbol}
                  categoryId={cat.id}
                  cap={o?.cap ?? null}
                  carry={o?.carry}
                  reserve={o?.reserve}
                  funds={o?.funds}
                  spent={o?.spent ?? 0}
                  noBudget={o?.no_budget}
                  currency={cur}
                  pace={pace}
                  onPress={() => edit(cat.id)}
                  onLongPress={open}
                  actions={[
                    { name: 'edit', label: t.common.edit, run: () => actions.edit(cat) },
                    { name: 'delete', label: t.common.delete, run: () => actions.remove(cat) },
                  ]}
                  last={i === active.length - 1}
                />
              )}
            </SwipeRow>
          );
        })}
      </Section>
      )}
      {hiddenOnes.length > 0 ? (
        <Section title={t.categories.hiddenTitle}>
          {hiddenOnes.map((cat, i) => (
            <Row
              key={cat.id}
              left={<CategoryIcon symbol={cat.sf_symbol} categoryId={cat.id} />}
              title={cat.name}
              onPress={() => edit(cat.id)}
              last={i === hiddenOnes.length - 1}
            />
          ))}
        </Section>
      ) : null}
      {archived.length > 0 ? (
        <Section title={t.categories.archived}>
          {archived.map((cat, i) => (
            <Row
              key={cat.id}
              left={<CategoryIcon symbol={cat.sf_symbol} categoryId={cat.id} />}
              title={cat.name}
              onPress={() => edit(cat.id)}
              last={i === archived.length - 1}
            />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  incomeSwipe: { marginHorizontal: 16, marginTop: 16, borderRadius: radius.hero, overflow: 'hidden' },
  headActions: { flexDirection: 'row', gap: tokens.space[4], paddingHorizontal: tokens.space[4] },
  headAction: { ...tokens.type.body, fontWeight: '600' },
  translate: { marginHorizontal: 16, marginTop: 16, borderRadius: tokens.radius.envelope, padding: tokens.space[4], gap: tokens.space[1] },
  translateTitle: { ...tokens.type.body, fontWeight: '700' },
  translateBody: { ...tokens.type.secondary },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], paddingStart: tokens.space[1], paddingEnd: tokens.space[4], minHeight: 56 },
  orderName: { ...tokens.type.body, flex: 1 },
  orderBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
