import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

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
          // The native header search bar doesn't exist on web; WebSearch below stands in.
          headerSearchBarOptions:
            Platform.OS === 'web' ? undefined : { placeholder: 'Search merchants', onChangeText: (e) => setQuery(e.nativeEvent.text) },
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
            {Platform.OS === 'web' ? <WebSearch value={query} onChange={setQuery} /> : null}
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

function WebSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={[s.search, { backgroundColor: c.fill }]}>
      <Icon name="magnifyingglass" size={16} color={c.secondaryLabel} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search merchants"
        placeholderTextColor={c.secondaryLabel as string}
        inputMode="search"
        autoCorrect={false}
        style={[s.searchInput, { color: c.label }]}
        accessibilityLabel="Search merchants"
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityLabel="Clear search">
          <Icon name="xmark.circle.fill" size={16} color={c.tertiaryLabel} />
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 8, borderRadius: 10, paddingHorizontal: 8, height: 36 },
  // 16px minimum, or iOS Safari zooms the page when the field is focused.
  searchInput: { flex: 1, fontSize: 17, paddingVertical: 0, outlineStyle: 'none' } as any,
  header: { fontSize: 13, marginTop: 22, marginBottom: 6, marginLeft: 32 },
  cell: { marginHorizontal: 16, overflow: 'hidden' },
  first: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  lastCell: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
});
