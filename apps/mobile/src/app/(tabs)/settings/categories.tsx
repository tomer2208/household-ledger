import { router, Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useCategories, useHousehold, useOverview } from '@/api/queries';
import { BudgetRow } from '@/components/budget-row';
import { IncomePlanCard } from '@/components/income-plan';
import { SwipeRow } from '@/components/swipe-row';
import { CategoryIcon, Row, Screen, Section } from '@/components/ui';
import { useCategoryActions } from '@/lib/category-actions';
import { monthPace } from '@/lib/dates';
import { useColors } from '@/lib/theme';

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

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Categories',
          headerLargeTitle: false,
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings/category')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Add category">
              <Text style={{ color: c.tint, fontSize: 17 }}>Add</Text>
            </Pressable>
          ),
        }}
      />
      {overview.data ? (
        <IncomePlanCard
          income={overview.data.income}
          budgeted={overview.data.total_cap}
          currency={cur}
          onPress={() => router.push('/settings/income')}
        />
      ) : null}
      <Section
        title="This month"
        footer="Swipe left on a category, or touch and hold, to edit or delete it. Budgets are monthly caps: a change applies from this month on, and closed months keep theirs.">
        {active.map((cat, i) => {
          const o = capById.get(cat.id);
          return (
            <SwipeRow key={cat.id} onEdit={() => actions.edit(cat)} onDelete={() => actions.remove(cat)}>
              {(open) => (
                <BudgetRow
                  name={cat.name}
                  symbol={cat.sf_symbol}
                  cap={o?.cap ?? null}
                  spent={o?.spent ?? 0}
                  noBudget={o?.no_budget}
                  currency={cur}
                  pace={pace}
                  onPress={() => edit(cat.id)}
                  onLongPress={open}
                  actions={[
                    { name: 'edit', label: 'Edit', run: () => actions.edit(cat) },
                    { name: 'delete', label: 'Delete', run: () => actions.remove(cat) },
                  ]}
                  last={i === active.length - 1}
                />
              )}
            </SwipeRow>
          );
        })}
      </Section>
      {archived.length > 0 ? (
        <Section title="Archived">
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
