import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCategories, useHousehold, useTransactionPages } from '@/api/queries';
import type { Transaction } from '@/api/types';
import { ADD_BUTTON_SPACE, AddButton } from '@/components/add-button';
import { OfflineBanner } from '@/components/offline-banner';
import { SwipeRow } from '@/components/swipe-row';
import { TransactionRow } from '@/components/transaction-row';
import { ListSkeleton } from '@/components/skeleton';
import { Empty, Icon, LoadingState } from '@/components/ui';
import { dayLabel, monthLabel } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { useTransactionActions } from '@/lib/transaction-actions';
import { useColors } from '@/lib/theme';

export default function TransactionsScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ category?: string; month?: string }>();
  const [query, setQuery] = useState('');
  // R7: the server searches every expense; wait for a pause in typing before asking it.
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
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
    for (const tx of txs.data?.pages.flat() ?? []) {
      if (seen.has(tx.id)) continue;
      seen.add(tx.id);
      const key = dayLabel(tx.occurred_at);
      groups.set(key, [...(groups.get(key) ?? []), tx]);
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
          title: categoryName ?? t.tabs.expenses,
          // The native header search bar doesn't exist on web; WebSearch below stands in.
          headerSearchBarOptions:
            Platform.OS === 'web' ? undefined : { placeholder: t.expenses.search, onChangeText: (e) => setQuery(e.nativeEvent.text) },
          headerLeft: categoryFilter || monthFilter
            ? () => (
                <Pressable onPress={clearFilters} hitSlop={12}>
                  <Text style={{ color: c.tint, fontSize: 17 }}>{t.common.all}</Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        sections={sections}
        keyExtractor={(tx) => tx.id}
        stickySectionHeadersEnabled={false}
        refreshing={txs.isRefetching && !txs.isFetchingNextPage}
        onRefresh={() => txs.refetch()}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          txs.isFetchingNextPage ? (
            <View style={s.footer} accessibilityLiveRegion="polite">
              <ActivityIndicator />
              <Text style={[s.footerText, { color: c.secondaryLabel }]}>{t.expenses.loadingMore}</Text>
            </View>
          ) : txs.isFetchNextPageError ? (
            <Pressable onPress={loadMore} accessibilityRole="button" style={s.footer} hitSlop={8}>
              <Text style={[s.footerText, { color: c.tint }]}>{t.expenses.moreFailed}</Text>
            </Pressable>
          ) : sections.length > 0 && !txs.hasNextPage ? (
            <Text style={[s.footerText, s.footer, { color: c.tertiaryLabel }]}>{t.expenses.everything}</Text>
          ) : null
        }
        ListHeaderComponent={
          <>
            {Platform.OS === 'web' ? <WebSearch value={query} onChange={setQuery} /> : null}
            {monthFilter ? (
              <Pressable
                onPress={clearFilters}
                accessibilityRole="button"
                accessibilityLabel={t.expenses.showingFilter([categoryName, monthLabel(monthFilter)].filter(Boolean).join(', '))}
                style={[s.chip, { backgroundColor: c.tintFill }]}>
                <Text style={[s.chipText, { color: c.tint }]}>{[categoryName, monthLabel(monthFilter)].filter(Boolean).join(' · ')}</Text>
                <Icon name="xmark.circle.fill" size={16} color={c.tint} />
              </Pressable>
            ) : null}
            <OfflineBanner />
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
            {/* R5 / US-M3 AC2: swipe for Edit and Delete (with Undo). */}
            <SwipeRow onEdit={() => actions.edit(item)} onDelete={() => actions.remove(item)}>
              {(open) => (
                <TransactionRow
                  tx={item}
                  baseCurrency={base}
                  last={index === section.data.length - 1}
                  onLongPress={open}
                  actions={[
                    { name: 'edit', label: t.common.edit, run: () => actions.edit(item) },
                    { name: 'delete', label: t.common.delete, run: () => actions.remove(item) },
                  ]}
                />
              )}
            </SwipeRow>
          </View>
        )}
        ListEmptyComponent={
          // P1-12: the list's shape while the first page loads; a retry when it couldn't load.
          !txs.data ? (
            <LoadingState
              error={txs.error}
              onRetry={() => txs.refetch()}
              retrying={txs.isFetching}
              skeleton={<ListSkeleton rows={4} sections={2} />}
            />
          ) : query.trim() !== search ? null : (
            <Empty
              icon="list.bullet"
              title={query || categoryFilter || monthFilter ? t.expenses.noMatches : t.expenses.emptyTitle}
              message={query || categoryFilter || monthFilter ? undefined : t.expenses.emptyMessage}
              action={
                categoryFilter || monthFilter
                  ? { label: t.expenses.showAll, kind: 'plain', onPress: clearFilters }
                  : query
                    ? undefined
                    : { label: t.expenses.setUpShortcut, kind: 'plain', onPress: () => router.push('/settings/devices') }
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
        placeholder={t.expenses.search}
        placeholderTextColor={c.secondaryLabel as string}
        inputMode="search"
        autoCorrect={false}
        style={[s.searchInput, { color: c.label }]}
        accessibilityLabel={t.expenses.search}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityLabel={t.expenses.clearSearch}>
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
  header: { fontSize: 13, marginTop: 22, marginBottom: 6, marginStart: 32 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 10, minHeight: 32, paddingHorizontal: 12, borderRadius: 16 },
  chipText: { fontSize: 15, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  footerText: { fontSize: 13, textAlign: 'center' },
  cell: { marginHorizontal: 16, overflow: 'hidden' },
  first: { borderTopStartRadius: 10, borderTopEndRadius: 10 },
  lastCell: { borderBottomStartRadius: 10, borderBottomEndRadius: 10 },
});
