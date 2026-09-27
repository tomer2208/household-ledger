import { router, Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useCategories, useHousehold, useOverview } from '@/api/queries';
import { Badge, CategoryIcon, Row, Screen, Section } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { useColors } from '@/lib/theme';

export default function CategoriesScreen() {
  const c = useColors();
  const cats = useCategories();
  const overview = useOverview();
  const cur = useHousehold().data?.household?.base_currency ?? 'ILS';
  const capById = new Map((overview.data?.categories ?? []).map((x) => [x.id, x]));
  const active = (cats.data ?? []).filter((x) => !x.archived_at);
  const archived = (cats.data ?? []).filter((x) => x.archived_at);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Categories',
          headerLargeTitle: false,
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings/category')} hitSlop={12}>
              <Text style={{ color: c.tint, fontSize: 17 }}>Add</Text>
            </Pressable>
          ),
        }}
      />
      <Section footer="Budgets are monthly caps. Changing one applies from this month on; closed months keep theirs.">
        {active.map((cat, i) => {
          const o = capById.get(cat.id);
          return (
            <Row
              key={cat.id}
              left={<CategoryIcon symbol={cat.sf_symbol} />}
              title={cat.name}
              value={o?.cap ? formatMoney(o.cap, cur) : o?.no_budget ? undefined : 'No budget'}
              right={o?.no_budget ? <Badge text="No budget" color={c.orange} /> : undefined}
              onPress={() => router.push({ pathname: '/settings/category', params: { id: cat.id } })}
              last={i === active.length - 1}
            />
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
              onPress={() => router.push({ pathname: '/settings/category', params: { id: cat.id } })}
              last={i === archived.length - 1}
            />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
