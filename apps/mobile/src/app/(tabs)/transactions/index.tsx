import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCategories, useHousehold, useOverview, useTransactionPages, useTransactionSummary } from '@/api/queries';
import type { Category, Member, Transaction } from '@/api/types';
import { ADD_BUTTON_SPACE, AddButton } from '@/components/add-button';
import { FilterSheet } from '@/components/filter-sheet';
import { OfflineBanner } from '@/components/offline-banner';
import { SwipeRow } from '@/components/swipe-row';
import { TransactionRow } from '@/components/transaction-row';
import { ListSkeleton } from '@/components/skeleton';
import { Badge, CategoryIcon, Empty, Icon, LoadingState, Row, Section } from '@/components/ui';
import { dayLabel, monthLabel, shortDate } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { formatMoney, formatSigned } from '@/lib/money';
import {
  activeGroups,
  EMPTY_FILTER,
  type FilterParams,
  filterFromParams,
  filterToParams,
  isEmptyFilter,
  serverFilter,
  toggleIn,
  type TxFilter,
  withoutAmount,
  withoutPeriod,
} from '@/lib/search-filter';
import { useTransactionActions } from '@/lib/transaction-actions';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

export default function TransactionsScreen() {
  const pending = useOverview().data?.pending_review ?? 0;
  const c = useColors();
  // P1-9: the filter lives in the URL, so a refresh or coming back from an expense keeps it.
  const params = useLocalSearchParams<FilterParams>();
  const [query, setQuery] = useState('');
  // R7: the server searches every expense; wait for a pause in typing before asking it.
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const cats = useCategories();
  const hh = useHousehold().data;
  const base = hh?.household?.base_currency ?? 'ILS';
  const filter = filterFromParams(params);
  const filtered = !isEmptyFilter(filter);
  const request = serverFilter(filter, search);
  const txs = useTransactionPages(request);
  const summary = useTransactionSummary(request, filtered || !!search);
  const [sheet, setSheet] = useState(false);
  const apply = (f: TxFilter) => router.setParams(filterToParams(f));
  const clearFilters = () => apply(EMPTY_FILTER);
  const chips = filterChips(filter, cats.data ?? [], hh?.members ?? [], base);
  // One category and nothing else (a tap on Overview) names the screen after it.
  const only = filter.categories.length === 1 && chips.length === 1 ? cats.data?.find((x) => x.id === filter.categories[0])?.name : undefined;
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
          title: only ?? t.tabs.expenses,
          // The native header search bar doesn't exist on web; WebSearch below stands in.
          headerSearchBarOptions:
            Platform.OS === 'web' ? undefined : { placeholder: t.expenses.search, onChangeText: (e) => setQuery(e.nativeEvent.text) },
          headerRight: Platform.OS === 'web' ? undefined : () => <FilterButton count={activeGroups(filter)} onPress={() => setSheet(true)} />,
        }}
      />
      <FilterSheet visible={sheet} value={filter} query={search} onClose={() => setSheet(false)} onApply={(f) => (setSheet(false), apply(f))} />
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
            {Platform.OS === 'web' ? (
              <View style={s.searchRow}>
                <WebSearch value={query} onChange={setQuery} />
                <FilterButton count={activeGroups(filter)} onPress={() => setSheet(true)} />
              </View>
            ) : null}
            {chips.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
                {chips.map((chip) => (
                  <Pressable
                    key={chip.key}
                    onPress={() => apply(chip.next)}
                    accessibilityRole="button"
                    accessibilityLabel={t.filters.remove(chip.label)}
                    style={[s.chip, { backgroundColor: c.tintFill }]}>
                    <Text numberOfLines={1} style={[s.chipText, { color: c.tint }]}>
                      {chip.label}
                    </Text>
                    <Icon name="xmark.circle.fill" size={16} color={c.tint} />
                  </Pressable>
                ))}
                {chips.length > 1 ? (
                  <Pressable onPress={clearFilters} accessibilityRole="button" style={s.clearAll} hitSlop={8}>
                    <Text style={[s.chipText, { color: c.tint }]}>{t.filters.clearAll}</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            ) : null}
            {(filtered || search) && summary.data?.count ? (
              <View style={s.summary} accessibilityLiveRegion="polite">
                {/* Net of refunds; more refunded than spent reads as money coming back, like a refund row. */}
                <Text style={[s.summaryTotal, { color: summary.data.total_minor < 0 ? c.green : c.label }]}>
                  {t.filters.summary(formatSigned(summary.data.total_minor, base), summary.data.count)}
                </Text>
                {summary.data.refunded_minor > 0 && summary.data.spent_minor > 0 ? (
                  <Text style={[s.summaryDetail, { color: c.secondaryLabel }]}>
                    {t.filters.summaryRefunds(formatMoney(summary.data.spent_minor, base), formatMoney(summary.data.refunded_minor, base))}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <OfflineBanner />
            {/* D3: the tab's badge counts these; here is where they're reviewed. */}
            {pending > 0 ? (
              <Section>
                <Row
                  left={<CategoryIcon symbol="tray.full" />}
                  title={t.review.title}
                  subtitle={t.overview.reviewSubtitle}
                  right={<Badge text={String(pending)} color={c.orange} />}
                  onPress={() => router.push('/review')}
                  last
                />
              </Section>
            ) : null}
          </>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[s.header, { color: c.secondaryLabel }]}>{section.title}</Text>
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
              title={query || filtered ? t.expenses.noMatches : t.expenses.emptyTitle}
              message={query || filtered ? undefined : t.expenses.emptyMessage}
              action={
                filtered
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

type Chip = { key: string; label: string; next: TxFilter };

// One removable chip per thing the list is filtered by; tapping one drops just that.
function filterChips(f: TxFilter, cats: Category[], members: Member[], base: string): Chip[] {
  const chips: Chip[] = [];
  if (f.period) {
    const label =
      f.period === 'month'
        ? monthLabel(f.month!)
        : f.period === 'custom'
          ? f.from && f.to
            ? `${shortDate(f.from)} – ${shortDate(f.to)}`
            : f.from
              ? t.filters.dayFrom(shortDate(f.from))
              : f.to
                ? t.filters.dayTo(shortDate(f.to))
                : t.filters.periods.custom
          : t.filters.periods[f.period];
    chips.push({ key: 'period', label, next: withoutPeriod(f) });
  }
  for (const id of f.categories) {
    const name = cats.find((x) => x.id === id)?.name;
    if (name) chips.push({ key: `c:${id}`, label: name, next: toggleIn.categories(f, id) });
  }
  if (f.min != null || f.max != null) {
    const [lo, hi] = f.min != null && f.max != null && f.min > f.max ? [f.max, f.min] : [f.min, f.max];
    const money = (v: number) => formatMoney(v, base);
    const label = lo != null && hi != null ? `${money(lo)}–${money(hi)}` : lo != null ? t.filters.amountMin(money(lo)) : t.filters.amountMax(money(hi!));
    chips.push({ key: 'amount', label, next: withoutAmount(f) });
  }
  for (const id of f.members) {
    const name = members.find((m) => m.user_id === id)?.display_name;
    if (name) chips.push({ key: `m:${id}`, label: name, next: toggleIn.members(f, id) });
  }
  for (const x of f.sources) chips.push({ key: `s:${x}`, label: t.tx.source[x], next: toggleIn.sources(f, x) });
  if (f.kind) chips.push({ key: 'kind', label: t.filters.kinds[f.kind], next: { ...f, kind: null } });
  return chips;
}

function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t.filters.buttonA11y(count)}
      style={[s.filterButton, { backgroundColor: count ? c.tint : c.fill }]}>
      <Icon name="line.3.horizontal.decrease" size={16} color={count ? c.onTint : c.label} />
      <Text style={[s.filterText, { color: count ? c.onTint : c.label }]}>{count ? `${t.filters.button} · ${count}` : t.filters.button}</Text>
    </Pressable>
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 8, height: 36 },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 10 },
  filterText: { fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
  chips: { gap: 8, paddingHorizontal: 16, marginTop: 10, alignItems: 'center' },
  clearAll: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  summary: { marginHorizontal: 32, marginTop: 14, gap: 2 },
  summaryTotal: { fontFamily: fontFamily.body, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  summaryDetail: { fontFamily: fontFamily.body, fontSize: 13 },
  // 16px minimum, or iOS Safari zooms the page when the field is focused.
  searchInput: { fontFamily: fontFamily.body, flex: 1, fontSize: 17, paddingVertical: 0, outlineStyle: 'none' } as any,
  header: { fontFamily: fontFamily.body, fontSize: 13, marginTop: 22, marginBottom: 6, marginStart: 32 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: 16, maxWidth: 240 },
  chipText: { fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  footerText: { fontFamily: fontFamily.body, fontSize: 13, textAlign: 'center' },
  cell: { marginHorizontal: 16, overflow: 'hidden' },
  first: { borderTopStartRadius: 10, borderTopEndRadius: 10 },
  lastCell: { borderBottomStartRadius: 10, borderBottomEndRadius: 10 },
});
