import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useCategories, useHousehold, useOverview } from '@/api/queries';
import { BudgetRow } from '@/components/budget-row';
import { IncomePlanCard } from '@/components/income-plan';
import { SwipeRow } from '@/components/swipe-row';
import { CategoryIcon, Row, Screen, Section } from '@/components/ui';
import { useCategoryActions } from '@/lib/category-actions';
import { useIncomeActions } from '@/lib/income-actions';
import { monthPace } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { radius, useColors } from '@/lib/theme';

export default function CategoriesScreen() {
  const c = useColors();
  const cats = useCategories();
  const overview = useOverview();
  const household = useHousehold().data?.household;
  const cur = household?.base_currency ?? 'ILS';
  const capById = new Map((overview.data?.categories ?? []).map((x) => [x.id, x]));
  const active = (cats.data ?? []).filter((x) => !x.archived_at);
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
            <Pressable onPress={() => router.push('/settings/category')} hitSlop={12} accessibilityRole="button" accessibilityLabel={t.categories.addA11y}>
              <Text style={{ color: c.tint, fontSize: 17 }}>{t.categories.add}</Text>
            </Pressable>
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
                  cap={o?.cap ?? null}
                  carry={o?.carry}
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
      {archived.length > 0 ? (
        <Section title={t.categories.archived}>
          {archived.map((cat, i) => (
            <Row
              key={cat.id}
              left={<CategoryIcon symbol={cat.sf_symbol} />}
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
});
