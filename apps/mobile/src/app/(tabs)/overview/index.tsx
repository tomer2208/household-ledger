import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHousehold, useOverview, useProposals } from '@/api/queries';
import { OfflineBanner } from '@/components/offline-banner';
import { ProposalCard } from '@/components/proposal-card';
import { Badge, CategoryIcon, Empty, ErrorText, Icon, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { daysLeftInMonth, monthLabel } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { budgetTone, useColors } from '@/lib/theme';

export default function OverviewScreen() {
  const c = useColors();
  const overview = useOverview();
  const hh = useHousehold();
  const proposals = useProposals();
  const o = overview.data;
  const cur = o?.currency ?? hh.data?.household?.base_currency ?? 'ILS';

  const budgeted = (o?.categories ?? []).filter((x) => x.cap != null && x.cap > 0);
  const unbudgetedWithSpend = (o?.categories ?? []).filter((x) => (x.cap == null || x.cap === 0) && x.spent !== 0);
  const noBudgetFlags = (o?.categories ?? []).filter((x) => x.no_budget);
  const totalPct = o && o.total_cap > 0 ? Math.round((o.total_spent * 100) / o.total_cap) : null;

  return (
    <Screen onRefresh={() => overview.refetch()} refreshing={overview.isRefetching}>
      <Stack.Screen
        options={{
          title: o ? monthLabel(o.month) : 'Overview',
          headerRight: () => (
            <Pressable onPress={() => router.push('/add')} hitSlop={12} accessibilityLabel="Add expense">
              <Icon name="plus" size={22} />
            </Pressable>
          ),
        }}
      />
      <OfflineBanner />
      <ErrorText error={overview.error} />

      {o ? (
        <>
          {/* Hero: where the month stands, all numbers from month_overview() */}
          <View style={[s.hero, { backgroundColor: c.cell }]}>
            <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>Spent this month</Text>
            <Text style={[s.heroAmount, { color: c.label }]}>{formatMoney(o.total_spent, cur)}</Text>
            {o.total_cap > 0 ? (
              <>
                <ProgressBar pct={totalPct ?? 0} color={budgetTone(totalPct, c)} />
                <View style={s.heroRow}>
                  <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>of {formatMoney(o.total_cap, cur)} budget</Text>
                  <Text style={[s.heroMeta, { color: o.net >= 0 ? c.green : c.red }]}>
                    {o.net >= 0 ? `${formatMoney(o.net, cur)} left` : `${formatMoney(-o.net, cur)} over`}
                  </Text>
                </View>
                <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>{daysLeftInMonth()} days left in the month</Text>
              </>
            ) : (
              <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>Set budgets in Settings to track what’s left.</Text>
            )}
          </View>

          <Section>
            <Row
              left={<CategoryIcon symbol="banknote" />}
              title="Savings"
              value={formatMoney(o.savings_balance, cur)}
              onPress={() => router.push('/settings/savings')}
              last={o.pending_review === 0}
            />
            {o.pending_review > 0 ? (
              <Row
                left={<CategoryIcon symbol="tray.full" />}
                title="To Review"
                subtitle="New places waiting for a category"
                right={<Badge text={String(o.pending_review)} color={c.orange} />}
                onPress={() => router.push('/review')}
                last
              />
            ) : null}
          </Section>

          {/* US-A2 AC1: the advisor's suggestions, highest priority first */}
          {[...(proposals.data ?? [])]
            .sort((a, b) => (a.rationale.priority ?? 9) - (b.rationale.priority ?? 9))
            .map((p) => (
              <ProposalCard key={p.id} p={p} currency={cur} />
            ))}

          {noBudgetFlags.length > 0 ? (
            <Section footer="Created from the Shortcut. Set a budget, or mark it as fine without one, in Settings → Categories.">
              {noBudgetFlags.map((cat, i) => (
                <Row
                  key={cat.id}
                  left={<CategoryIcon symbol={cat.sf_symbol} />}
                  title={cat.name}
                  right={<Badge text="No budget" color={c.orange} />}
                  onPress={() => router.push({ pathname: '/settings/category', params: { id: cat.id } })}
                  last={i === noBudgetFlags.length - 1}
                />
              ))}
            </Section>
          ) : null}

          {budgeted.length > 0 ? (
            <Section title="Budgets">
              {budgeted.map((cat, i) => (
                <Pressable
                  key={cat.id}
                  onPress={() => router.push({ pathname: '/transactions', params: { category: cat.id } })}
                  style={({ pressed }) => [s.budgetRow, pressed && { backgroundColor: c.fill }]}>
                  <CategoryIcon symbol={cat.sf_symbol} />
                  <View style={[s.budgetBody, i < budgeted.length - 1 && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                    <View style={s.budgetTop}>
                      <Text style={[s.budgetName, { color: c.label }]}>{cat.name}</Text>
                      <Text style={[s.budgetNums, { color: c.secondaryLabel }]}>
                        {formatMoney(cat.spent, cur)} / {formatMoney(cat.cap, cur)}
                      </Text>
                    </View>
                    <ProgressBar pct={cat.pct ?? 0} color={budgetTone(cat.pct, c)} />
                  </View>
                </Pressable>
              ))}
            </Section>
          ) : null}

          {unbudgetedWithSpend.length > 0 ? (
            <Section title="Without a budget" footer="Counted against savings at month end, like a budget of zero.">
              {unbudgetedWithSpend.map((cat, i) => (
                <Row
                  key={cat.id}
                  left={<CategoryIcon symbol={cat.sf_symbol} />}
                  title={cat.name}
                  value={formatMoney(cat.spent, cur)}
                  onPress={() => router.push({ pathname: '/transactions', params: { category: cat.id } })}
                  last={i === unbudgetedWithSpend.length - 1}
                />
              ))}
            </Section>
          ) : null}

          {o.total_spent === 0 && budgeted.length === 0 ? (
            <Empty icon="chart.pie" title="Nothing yet this month" message="Tap + to add an expense, or set up the Apple Pay Shortcut in Settings." />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 18, gap: 8 },
  heroLabel: { fontSize: 15 },
  heroAmount: { fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between' },
  heroMeta: { fontSize: 14, fontVariant: ['tabular-nums'] },
  budgetRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 12 },
  budgetBody: { flex: 1, paddingVertical: 12, paddingRight: 16, gap: 8 },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  budgetName: { fontSize: 17 },
  budgetNums: { fontSize: 14, fontVariant: ['tabular-nums'] },
});
