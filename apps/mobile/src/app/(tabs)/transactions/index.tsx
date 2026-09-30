import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCategories, useHousehold, useTransactionPages } from '@/api/queries';
import type { Transaction } from '@/api/types';
import { ADD_BUTTON_SPACE, AddButton } from '@/components/add-button';
import { OfflineBanner } from '@/components/offline-banner';
import { SwipeRow } from '@/components/swipe-row';
import { TransactionRow } from '@/components/transaction-row';
import { Empty, ErrorText, Icon } from '@/components/ui';
import { dayLabel, monthLabel } from '@/lib/dates';
import { useTransactionActions } from '@/lib/transaction-actions';
import { useColors } from '@/lib/theme';

export default function TransactionsScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ category?: string; month?: string }>();
  const [query, setQuery] = useState('');
  // R7: the server searches every expense; wait for a pause in typing before asking it.
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const cats = useCategories();
  const base = useHousehold().data?.household?.base_currency ?? 'ILS';
  const categoryFilter = params.category ?? null;
  // P1-5: a past month on Overview opens its own expenses only.
  const monthFilter = params.month && /^\d{4}-\d{2}-\d{2}$/.test(params.month) ? params.month : null;
  const txs = useTransactionPages(search, categoryFilter, monthFilter);
  const clearFilters = () => router.setParams({ category: undefined, month: undefined });
  const categoryName = cats.data?.find((x) => x.id === categoryFilter)?.name;
  const actions = useTransactionActions();

  // US-M3 AC1: grouped by day. Search and category run on the server (R7); a row can only
  // repeat across pages if it moved while paging, so ids are de-duplicated.
  const sections = useMemo(() => {
    const seen = new Set<string>();
    const groups = new Map<string, Transaction[]>();
    for (const t of txs.data?.pages.flat() ?? []) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      const key = dayLabel(t.occurred_at);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.entries()].map(([title, data]) => ({ title, data }));
  }, [txs.data]);
  const loadMore = () => {
    if (txs.hasNextPage && !txs.isFetchingNextPage) txs.fetchNextPage();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.groupedBackground }}>
      <Stack.Screen
        options={{
          title: categoryName ?? 'Expenses',
          // The native header search bar doesn't exist on web; WebSearch below stands in.
          headerSearchBarOptions:
            Platform.OS === 'web' ? undefined : { placeholder: 'Search merchants', onChangeText: (e) => setQuery(e.nativeEvent.text) },
          headerLeft: categoryFilter || monthFilter
            ? () => (
                <Pressable onPress={clearFilters} hitSlop={12}>
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
        refreshing={txs.isRefetching && !txs.isFetchingNextPage}
        onRefresh={() => txs.refetch()}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          txs.isFetchingNextPage ? (
            <View style={s.footer} accessibilityLiveRegion="polite">
              <ActivityIndicator />
              <Text style={[s.footerText, { color: c.secondaryLabel }]}>Loading more…</Text>
            </View>
          ) : sections.length > 0 && !txs.hasNextPage ? (
            <Text style={[s.footerText, s.footer, { color: c.tertiaryLabel }]}>That’s everything</Text>
          ) : null
        }
        ListHeaderComponent={
          <>
            {Platform.OS === 'web' ? <WebSearch value={query} onChange={setQuery} /> : null}
            {monthFilter ? (
              <Pressable
                onPress={clearFilters}
                accessibilityRole="button"
                accessibilityLabel={`Showing ${[categoryName, monthLabel(monthFilter)].filter(Boolean).join(', ')}. Show all expenses`}
                style={[s.chip, { backgroundColor: c.tintFill }]}>
                <Text style={[s.chipText, { color: c.tint }]}>{[categoryName, monthLabel(monthFilter)].filter(Boolean).join(' · ')}</Text>
                <Icon name="xmark.circle.fill" size={16} color={c.tint} />
              </Pressable>
            ) : null}
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
            {/* R5 / US-M3 AC2: swipe left for Edit and Delete (with Undo). */}
            <SwipeRow onEdit={() => actions.edit(item)} onDelete={() => actions.remove(item)}>
              {(open) => (
                <TransactionRow
                  tx={item}
                  baseCurrency={base}
                  last={index === section.data.length - 1}
                  onLongPress={open}
                  actions={[
                    { name: 'edit', label: 'Edit', run: () => actions.edit(item) },
                    { name: 'delete', label: 'Delete', run: () => actions.remove(item) },
                  ]}
                />
              )}
            </SwipeRow>
          </View>
        )}
        ListEmptyComponent={
          txs.isLoading || (query.trim() !== search) ? null : (
            <Empty
              icon="list.bullet"
              title={query || categoryFilter || monthFilter ? 'No matches' : 'No expenses yet'}
              message={query || categoryFilter || monthFilter ? undefined : 'Apple Pay purchases appear here automatically once the Shortcut is set up.'}
              action={
                categoryFilter || monthFilter
                  ? { label: 'Show All Expenses', kind: 'plain', onPress: clearFilters }
                  : query
                    ? undefined
                    : { label: 'Set Up the Shortcut', kind: 'plain', onPress: () => router.push('/settings/devices') }
              }
            />
          )
        }
        contentContainerStyle={{ paddingBottom: 40 + ADD_BUTTON_SPACE }}
      />
      <AddButton />
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
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 10, minHeight: 32, paddingHorizontal: 12, borderRadius: 16 },
  chipText: { fontSize: 15, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  footerText: { fontSize: 13, textAlign: 'center' },
  cell: { marginHorizontal: 16, overflow: 'hidden' },
  first: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  lastCell: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
});
