import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHousehold, useOverview, useProposals } from '@/api/queries';
import type { OverviewCategory } from '@/api/types';
import { ADD_BUTTON_SPACE, AddButton } from '@/components/add-button';
import { BudgetRow } from '@/components/budget-row';
import { CaptureBanner } from '@/components/capture-banner';
import { InstallBanner } from '@/components/install-banner';
import { MonthSwitcher } from '@/components/month-switcher';
import { SetupCard } from '@/components/setup-card';
import { OfflineBanner } from '@/components/offline-banner';
import { ProposalCard } from '@/components/proposal-card';
import { SwipeRow } from '@/components/swipe-row';
import { OverviewSkeleton } from '@/components/skeleton';
import { Badge, CategoryIcon, Empty, LoadingState, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { daysToGo, incomePlan, perDay } from '@/lib/budget';
import { useCategoryActions } from '@/lib/category-actions';
import { currentMonth, monthLabel, monthOfInstant, monthPace } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { budgetTone, moneyText, radius, useColors } from '@/lib/theme';

export default function OverviewScreen() {
  const c = useColors();
  const hh = useHousehold();
  // P1-5: null is the current month; a past month is read-only history.
  const [month, setMonth] = useState<string | null>(null);
  const overview = useOverview(month ?? undefined);
  const thisMonth = currentMonth();
  const createdAt = hh.data?.household?.created_at;
  const firstMonth = createdAt ? monthOfInstant(new Date(createdAt)) : thisMonth;
  const past = month != null;
  const goTo = (m: string) => setMonth(m >= thisMonth ? null : m);
  const proposals = useProposals();
  const o = overview.data;
  const cur = o?.currency ?? hh.data?.household?.base_currency ?? 'ILS';

  const budgeted = (o?.categories ?? []).filter((x) => x.cap != null && x.cap > 0);
  const unbudgetedWithSpend = (o?.categories ?? []).filter((x) => (x.cap == null || x.cap === 0) && x.spent !== 0);
  const noBudgetFlags = (o?.categories ?? []).filter((x) => x.no_budget);
  const totalPct = o && o.total_cap > 0 ? Math.round((o.total_spent * 100) / o.total_cap) : null;
  const pace = monthPace();
  const days = daysToGo();
  const actions = useCategoryActions(hh.data?.household?.id);
  const plan = incomePlan(o?.income, o?.total_cap ?? 0);

  // A category's line on Overview. This month: swipe or long press for Edit and Delete, tap
  // for its expenses. A past month is history: read-only, and tap shows that month's expenses.
  const categoryRow = (cat: OverviewCategory, cap: number | null, last: boolean) => {
    const row = (open?: () => void) => (
      <BudgetRow
        key={past ? cat.id : undefined}
        name={cat.name}
        symbol={cat.sf_symbol}
        cap={cap}
        spent={cat.spent}
        currency={cur}
        pace={past || cap == null ? undefined : pace}
        onPress={() =>
          router.push({ pathname: '/transactions', params: past && o ? { category: cat.id, month: o.month } : { category: cat.id } })
        }
        onLongPress={open}
        actions={
          past
            ? undefined
            : [
                { name: 'edit', label: t.common.edit, run: () => actions.edit(cat) },
                { name: 'delete', label: t.common.delete, run: () => actions.remove(cat) },
              ]
        }
        last={last}
      />
    );
    if (past) return row();
    return (
      <SwipeRow key={cat.id} onEdit={() => actions.edit(cat)} onDelete={() => actions.remove(cat)}>
        {(open) => row(open)}
      </SwipeRow>
    );
  };

  return (
    <View style={s.fill}>
      <Screen onRefresh={() => overview.refetch()} refreshing={overview.isRefetching} bottomSpace={ADD_BUTTON_SPACE}>
        <Stack.Screen options={{ title: t.tabs.overview }} />
        <OfflineBanner />
        {!past ? <InstallBanner /> : null}
        {!past ? <CaptureBanner /> : null}
        {!past ? <SetupCard /> : null}
        <MonthSwitcher month={month ?? o?.month ?? thisMonth} first={firstMonth} current={thisMonth} onChange={goTo} />

        {o ? (
          <>
            {/* Hero: what's left of the month, all numbers from month_overview() */}
            <View style={[s.hero, { backgroundColor: c.cell }]}>
              {past ? (
                // How the month ended: no pace, no per-day, and the report once it's closed.
                <>
                  <View style={s.heroRow}>
                    <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>
                      {o.total_cap > 0 ? (o.net >= 0 ? t.overview.leftUnspent : t.overview.overBudget) : t.overview.spentIn(monthLabel(o.month))}
                    </Text>
                    <Badge text={o.closed ? t.overview.closed : t.overview.notClosed} color={o.closed ? c.secondaryLabel : c.orange} />
                  </View>
                  <Text style={[s.heroAmount, { color: o.total_cap > 0 ? (o.net >= 0 ? c.green : c.red) : c.label }]}>
                    {formatMoney(o.total_cap > 0 ? Math.abs(o.net) : o.total_spent, cur)}
                  </Text>
                  {o.total_cap > 0 ? (
                    <>
                      <ProgressBar pct={totalPct ?? 0} color={budgetTone(totalPct, c)} />
                      <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>
                        {t.common.of(formatMoney(o.total_spent, cur), formatMoney(o.total_cap, cur))}
                      </Text>
                    </>
                  ) : null}
                  {o.closed ? (
                    <Pressable
                      onPress={() => router.push({ pathname: '/reports/[month]', params: { month: o.month } })}
                      accessibilityRole="button"
                      hitSlop={8}>
                      <Text style={[s.heroMeta, { color: c.tint }]}>{t.overview.reportLink(monthLabel(o.month))}</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : o.total_cap > 0 ? (
                <>
                  <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>{o.net >= 0 ? t.overview.leftThisMonth : t.overview.overThisMonth}</Text>
                  <Text style={[s.heroAmount, { color: o.net >= 0 ? budgetTone(totalPct, c, pace) : c.red }]}>
                    {formatMoney(Math.abs(o.net), cur)}
                  </Text>
                  <ProgressBar pct={totalPct ?? 0} color={budgetTone(totalPct, c, pace)} pace={pace} />
                  <View style={s.heroRow}>
                    <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>
                      {t.common.of(formatMoney(o.total_spent, cur), formatMoney(o.total_cap, cur))}
                    </Text>
                    <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>
                      {o.net > 0 ? `${t.overview.perDay(formatMoney(perDay(o.net, days), cur))} · ` : ''}
                      {t.overview.daysToGo(days)}
                    </Text>
                  </View>
                  {plan.kind !== 'none' ? (
                    <Pressable onPress={() => router.push('/settings/income')} accessibilityRole="button" hitSlop={6}>
                      <Text style={[s.heroMeta, { color: plan.health === 'over' ? c.red : plan.health === 'thin' ? c.orange : c.green }]}>
                        {plan.kind === 'over'
                          ? t.overview.budgetsOverIncome(formatMoney(-plan.unassigned, cur))
                          : t.overview.unassignedToSavings(formatMoney(plan.unassigned, cur), plan.savingsPct)}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>{t.overview.spentThisMonth}</Text>
                  <Text style={[s.heroAmount, { color: c.label }]}>{formatMoney(o.total_spent, cur)}</Text>
                  <Pressable onPress={() => router.push('/settings/categories')} accessibilityRole="button" hitSlop={8}>
                    <Text style={[s.heroMeta, { color: c.tint }]}>{t.overview.setBudgetsLink}</Text>
                  </Pressable>
                </>
              )}
            </View>

            {!past && o.pending_review > 0 ? (
              <Section>
                <Row
                  left={<CategoryIcon symbol="tray.full" />}
                  title={t.review.title}
                  subtitle={t.overview.reviewSubtitle}
                  right={<Badge text={String(o.pending_review)} color={c.orange} />}
                  onPress={() => router.push('/review')}
                  last
                />
              </Section>
            ) : null}

            {/* US-A2 AC1: the advisor's suggestions, highest priority first */}
            {(past ? [] : [...(proposals.data ?? [])])
              .sort((a, b) => (a.rationale.priority ?? 9) - (b.rationale.priority ?? 9))
              .map((p) => (
                <ProposalCard key={p.id} p={p} currency={cur} />
              ))}

            {!past && noBudgetFlags.length > 0 ? (
              <Section footer={t.overview.noBudgetFooter}>
                {noBudgetFlags.map((cat, i) => (
                  <Row
                    key={cat.id}
                    left={<CategoryIcon symbol={cat.sf_symbol} />}
                    title={cat.name}
                    right={<Badge text={t.overview.noBudget} color={c.orange} />}
                    onPress={() => router.push({ pathname: '/settings/category', params: { id: cat.id } })}
                    last={i === noBudgetFlags.length - 1}
                  />
                ))}
              </Section>
            ) : null}

            {budgeted.length > 0 ? (
              <Section
                title={t.overview.budgets}
                action={
                  past ? undefined : { label: t.common.edit, accessibilityLabel: t.overview.editBudgets, onPress: () => router.push('/settings/categories') }
                }>
                {budgeted.map((cat, i) => categoryRow(cat, cat.cap, i === budgeted.length - 1))}
              </Section>
            ) : null}

            {unbudgetedWithSpend.length > 0 ? (
              <Section title={t.overview.withoutBudget} footer={past ? undefined : t.overview.withoutBudgetFooter}>
                {unbudgetedWithSpend.map((cat, i) => categoryRow(cat, null, i === unbudgetedWithSpend.length - 1))}
              </Section>
            ) : null}

            {/* Checked less often than the month itself, so it sits below the budgets. */}
            <Section>
              <Row
                left={<CategoryIcon symbol="banknote" />}
                title={t.overview.savings}
                value={formatMoney(o.savings_balance, cur)}
                onPress={() => router.push('/settings/savings')}
                last
              />
            </Section>

            {!past && o.total_spent === 0 && budgeted.length === 0 ? (
              <Empty
                icon="chart.pie"
                title={t.overview.emptyTitle}
                message={t.overview.emptyMessage}
                action={{ label: t.overview.setBudgets, kind: 'plain', onPress: () => router.push('/settings/categories') }}
              />
            ) : null}
          </>
        ) : (
          <LoadingState error={overview.error} onRetry={() => overview.refetch()} retrying={overview.isFetching} skeleton={<OverviewSkeleton />} />
        )}
      </Screen>
      <AddButton />
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  hero: { marginHorizontal: 16, marginTop: 12, borderRadius: radius.hero, padding: 18, gap: 8 },
  heroLabel: { fontSize: 15 },
  heroAmount: { fontSize: 40, fontWeight: '700', ...moneyText },
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12, rowGap: 2 },
  heroMeta: { fontSize: 14, ...moneyText },
});
