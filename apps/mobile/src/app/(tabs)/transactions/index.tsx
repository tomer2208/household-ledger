import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { useCategories, useHousehold, useTransactions } from '@/api/queries';
import type { Transaction } from '@/api/types';
import { OfflineBanner } from '@/components/offline-banner';
import { TransactionRow } from '@/components/transaction-row';
import { Empty, ErrorText, Icon } from '@/components/ui';
import { dayLabel } from '@/lib/dates';
import { useColors } from '@/lib/theme';

export default function TransactionsScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ category?: string }>();
  const [query, setQuery] = useState('');
  const txs = useTransactions();
  const cats = useCategories();
  const base = useHousehold().data?.household?.base_currency ?? 'ILS';
  const categoryFilter = params.category ?? null;
  const categoryName = cats.data?.find((x) => x.id === categoryFilter)?.name;

  // US-M3 AC1: grouped by day, searchable by title or raw merchant, filterable by category.
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (txs.data ?? []).filter(
      (t) =>
        (!categoryFilter || t.category_id === categoryFilter) &&
        (!q || t.title.toLowerCase().includes(q) || (t.raw_merchant ?? '').toLowerCase().includes(q)),
    );
    const groups = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = dayLabel(t.occurred_at);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.entries()].map(([title, data]) => ({ title, data }));
  }, [txs.data, query, categoryFilter]);

  return (
    <View style={{ flex: 1, backgroundColor: c.groupedBackground }}>
      <Stack.Screen
        options={{
          title: categoryName ?? 'Expenses',
          headerSearchBarOptions: { placeholder: 'Search merchants', onChangeText: (e) => setQuery(e.nativeEvent.text) },
          headerRight: () => (
            <Pressable onPress={() => router.push('/add')} hitSlop={12} accessibilityLabel="Add expense">
              <Icon name="plus" size={22} />
            </Pressable>
          ),
          headerLeft: categoryFilter
            ? () => (
                <Pressable onPress={() => router.setParams({ category: undefined })} hitSlop={12}>
                  <Text style={{ color: c.tint, fontSize: 17 }}>All</Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        refreshing={txs.isRefetching}
        onRefresh={() => txs.refetch()}
        ListHeaderComponent={
          <>
            <OfflineBanner />
            <ErrorText error={txs.error} />
          </>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[s.header, { color: c.secondaryLabel }]}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item, index, section }) => (
          <View
            style={[
              s.cell,
              { backgroundColor: c.cell },
              index === 0 && s.first,
              index === section.data.length - 1 && s.lastCell,
            ]}>
            <TransactionRow tx={item} baseCurrency={base} last={index === section.data.length - 1} />
          </View>
        )}
        ListEmptyComponent={
          txs.isLoading ? null : (
            <Empty
              icon="list.bullet"
              title={query || categoryFilter ? 'No matches' : 'No expenses yet'}
              message={query || categoryFilter ? undefined : 'Apple Pay purchases appear here automatically once the Shortcut is set up.'}
            />
          )
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  header: { fontSize: 13, marginTop: 22, marginBottom: 6, marginLeft: 32 },
  cell: { marginHorizontal: 16, overflow: 'hidden' },
  first: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  lastCell: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
});
