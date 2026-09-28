import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHousehold, useOverview, useProposals } from '@/api/queries';
import { ADD_BUTTON_SPACE, AddButton } from '@/components/add-button';
import { BudgetRow } from '@/components/budget-row';
import { InstallBanner } from '@/components/install-banner';
import { OfflineBanner } from '@/components/offline-banner';
import { ProposalCard } from '@/components/proposal-card';
import { SwipeRow } from '@/components/swipe-row';
import { Badge, CategoryIcon, Empty, ErrorText, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { daysToGo, incomePlan, perDay } from '@/lib/budget';
import { useCategoryActions } from '@/lib/category-actions';
import { monthLabel, monthPace } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { budgetTone, moneyText, radius, useColors } from '@/lib/theme';

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
  const pace = monthPace();
  const days = daysToGo();
  const actions = useCategoryActions(hh.data?.household?.id);
  const plan = incomePlan(o?.income, o?.total_cap ?? 0);

  return (
    <View style={s.fill}>
      <Screen onRefresh={() => overview.refetch()} refreshing={overview.isRefetching} bottomSpace={ADD_BUTTON_SPACE}>
        <Stack.Screen
          options={{
            title: o ? monthLabel(o.month) : 'Overview',
          }}
        />
        <OfflineBanner />
        <InstallBanner />
        <ErrorText error={overview.error} />

        {o ? (
          <>
            {/* Hero: what's left of the month, all numbers from month_overview() */}
            <View style={[s.hero, { backgroundColor: c.cell }]}>
              {o.total_cap > 0 ? (
                <>
                  <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>{o.net >= 0 ? 'Left this month' : 'Over budget this month'}</Text>
                  <Text style={[s.heroAmount, { color: o.net >= 0 ? budgetTone(totalPct, c, pace) : c.red }]}>
                    {formatMoney(Math.abs(o.net), cur)}
                  </Text>
                  <ProgressBar pct={totalPct ?? 0} color={budgetTone(totalPct, c, pace)} pace={pace} />
                  <View style={s.heroRow}>
                    <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>
                      {formatMoney(o.total_spent, cur)} of {formatMoney(o.total_cap, cur)}
                    </Text>
                    <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>
                      {o.net > 0 ? `≈ ${formatMoney(perDay(o.net, days), cur)} a day · ` : ''}
                      {days === 1 ? 'last day' : `${days} days to go`}
                    </Text>
                  </View>
                  {plan.kind !== 'none' ? (
                    <Pressable onPress={() => router.push('/settings/income')} accessibilityRole="button" hitSlop={6}>
                      <Text style={[s.heroMeta, { color: plan.health === 'over' ? c.red : plan.health === 'thin' ? c.orange : c.green }]}>
                        {plan.kind === 'over'
                          ? `Budgets are ${formatMoney(-plan.unassigned, cur)} over income`
                          : `${formatMoney(plan.unassigned, cur)} of income unassigned → savings (${plan.savingsPct}%)`}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>Spent this month</Text>
                  <Text style={[s.heroAmount, { color: c.label }]}>{formatMoney(o.total_spent, cur)}</Text>
                  <Pressable onPress={() => router.push('/settings/categories')} accessibilityRole="button" hitSlop={8}>
                  <Text style={[s.heroMeta, { color: c.tint }]}>Set budgets to see what’s left ›</Text>
                </Pressable>
                </>
              )}
            </View>

            {o.pending_review > 0 ? (
              <Section>
                <Row
                  left={<CategoryIcon symbol="tray.full" />}
                  title="To Review"
                  subtitle="New places waiting for a category"
                  right={<Badge text={String(o.pending_review)} color={c.orange} />}
                  onPress={() => router.push('/review')}
                  last
                />
              </Section>
            ) : null}

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
              <Section
                title="Budgets"
                action={{ label: 'Edit', accessibilityLabel: 'Edit categories and budgets', onPress: () => router.push('/settings/categories') }}>
                {budgeted.map((cat, i) => (
                  <SwipeRow key={cat.id} onEdit={() => actions.edit(cat)} onDelete={() => actions.remove(cat)}>
                    {(open) => (
                      <BudgetRow
                        name={cat.name}
                        symbol={cat.sf_symbol}
                        cap={cat.cap}
                        spent={cat.spent}
                        currency={cur}
                        pace={pace}
                        onPress={() => router.push({ pathname: '/transactions', params: { category: cat.id } })}
                        onLongPress={open}
                        actions={[
                          { name: 'edit', label: 'Edit', run: () => actions.edit(cat) },
                          { name: 'delete', label: 'Delete', run: () => actions.remove(cat) },
                        ]}
                        last={i === budgeted.length - 1}
                      />
                    )}
                  </SwipeRow>
                ))}
              </Section>
            ) : null}

            {unbudgetedWithSpend.length > 0 ? (
              <Section title="Without a budget" footer="Counted against savings at month end, like a budget of zero.">
                {unbudgetedWithSpend.map((cat, i) => (
                  <SwipeRow key={cat.id} onEdit={() => actions.edit(cat)} onDelete={() => actions.remove(cat)}>
                    {(open) => (
                      <BudgetRow
                        name={cat.name}
                        symbol={cat.sf_symbol}
                        cap={null}
                        spent={cat.spent}
                        currency={cur}
                        onPress={() => router.push({ pathname: '/transactions', params: { category: cat.id } })}
                        onLongPress={open}
                        actions={[
                          { name: 'edit', label: 'Edit', run: () => actions.edit(cat) },
                          { name: 'delete', label: 'Delete', run: () => actions.remove(cat) },
                        ]}
                        last={i === unbudgetedWithSpend.length - 1}
                      />
                    )}
                  </SwipeRow>
                ))}
              </Section>
            ) : null}

            {/* Checked less often than the month itself, so it sits below the budgets. */}
            <Section>
              <Row
                left={<CategoryIcon symbol="banknote" />}
                title="Savings"
                value={formatMoney(o.savings_balance, cur)}
                onPress={() => router.push('/settings/savings')}
                last
              />
            </Section>

            {o.total_spent === 0 && budgeted.length === 0 ? (
              <Empty
                icon="chart.pie"
                title="Start with your budgets"
                message="Give each category a monthly budget, and this screen shows what’s left as you spend."
                action={{ label: 'Set Budgets', kind: 'plain', onPress: () => router.push('/settings/categories') }}
              />
            ) : null}
          </>
        ) : null}
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
