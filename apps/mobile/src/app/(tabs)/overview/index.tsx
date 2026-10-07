import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCategories, useHousehold, useOverview, useProposals } from '@/api/queries';
import type { Forecast, OverviewCategory } from '@/api/types';
import { ADD_BUTTON_SPACE, AddButton } from '@/components/add-button';
import { CaptureBanner } from '@/components/capture-banner';
import { InstallBanner } from '@/components/install-banner';
import { MonthSwitcher } from '@/components/month-switcher';
import { SetupCard } from '@/components/setup-card';
import { OfflineBanner } from '@/components/offline-banner';
import { BudgetSheet } from '@/components/budget-sheet';
import { Envelope, EnvelopeGrid } from '@/components/envelope';
import { MenuSheet } from '@/components/sheet';
import { money } from '@/components/money-text';
import { ProposalCard } from '@/components/proposal-card';
import { OverviewSkeleton } from '@/components/skeleton';
import { Badge, CategoryIcon, Empty, Icon, LoadingState, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { daysToGo, forecastSummary, type ForecastSummary, incomePlan, perDay } from '@/lib/budget';
import { useCategoryActions } from '@/lib/category-actions';
import { lookOf } from '@/lib/category-look';
import { currentMonth, monthDay, monthLabel, monthOfInstant } from '@/lib/dates';
import { envelopeStatus, runsOutOn } from '@/lib/envelope';
import { t } from '@/lib/i18n';
import { budgetTone, moneyText, tokens, useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

export default function OverviewScreen() {
  const c = useColors();
  const hh = useHousehold();
  // P1-5: null is the current month; a past month is read-only history. P1-11: the month lives
  // in the URL (?month=YYYY-MM-01), so a month tapped on a report's chart opens here.
  const params = useLocalSearchParams<{ month?: string }>();
  const thisMonth = currentMonth();
  const month = params.month && /^\d{4}-\d{2}-01$/.test(params.month) && params.month < thisMonth ? params.month : null;
  const setMonth = (m: string | null) => router.setParams({ month: m ?? undefined });
  const overview = useOverview(month ?? undefined);
  const createdAt = hh.data?.household?.created_at;
  const firstMonth = createdAt ? monthOfInstant(new Date(createdAt)) : thisMonth;
  const past = month != null;
  const goTo = (m: string) => setMonth(m >= thisMonth ? null : m);
  const proposals = useProposals();
  const o = overview.data;
  const cur = o?.currency ?? hh.data?.household?.base_currency ?? 'ILS';

  // P2: the household's own colour and icon per category, and hidden ones stay out unless spent on.
  const own = new Map((useCategories().data ?? []).map((x) => [x.id, x]));
  const shown = (o?.categories ?? []).filter((x) => !own.get(x.id)?.hidden || x.spent !== 0);
  const budgeted = shown.filter((x) => x.cap != null && x.cap > 0);
  const unbudgetedWithSpend = shown.filter((x) => (x.cap == null || x.cap === 0) && x.spent !== 0);
  const noBudgetFlags = (o?.categories ?? []).filter((x) => x.no_budget);
  const totalPct = o && o.total_cap > 0 ? Math.round((o.total_spent * 100) / o.total_cap) : null;
  const days = daysToGo();
  const today = monthDay();
  const actions = useCategoryActions(hh.data?.household?.id);
  const plan = incomePlan(o?.income, o?.total_base_cap ?? 0);
  // P1-17: where the month is heading; the line opens how it adds up.
  const forecast = !past ? forecastSummary(o?.forecast, o?.total_cap ?? 0) : null;
  const [showForecast, setShowForecast] = useState(false);
  // K3 / P3: an envelope's long press opens its menu; "Change the budget" opens the budget sheet.
  const [menuFor, setMenuFor] = useState<OverviewCategory | null>(null);
  const [budgetFor, setBudgetFor] = useState<OverviewCategory | null>(null);

  // K1 / O1: a category as an envelope. This month: tap to add an expense to it (C4), long press
  // for the category (its budget, trend and expenses). A past month is history: tap shows that
  // month's expenses.
  const envelopeFor = (cat: OverviewCategory, cap: number | null) => {
    const out = past ? null : runsOutOn(cap, cat.spent, today.day, today.days);
    return (
      <Envelope
        key={cat.id}
        name={cat.name}
        symbol={cat.sf_symbol}
        icon={lookOf(own.get(cat.id) ?? cat).icon}
        color={lookOf(own.get(cat.id) ?? cat).color}
        cap={cap}
        spent={cat.spent}
        currency={cur}
        hint={out ? t.envelope.runsOut(out) : null}
        onPress={() =>
          past && o
            ? router.push({ pathname: '/transactions', params: { category: cat.id, month: o.month } })
            : router.push({ pathname: '/add', params: { category: cat.id } })
        }
        onLongPress={past ? undefined : () => setMenuFor(cat)}
        actions={
          past
            ? undefined
            : [
                { name: 'budget', label: t.envelope.editBudget, run: () => setBudgetFor(cat) },
                { name: 'expenses', label: t.envelope.expenses, run: () => router.push({ pathname: '/transactions', params: { category: cat.id } }) },
                { name: 'edit', label: t.envelope.editEnvelope, run: () => actions.edit(cat) },
                { name: 'delete', label: t.common.delete, run: () => actions.remove(cat) },
              ]
        }
      />
    );
  };
  const overCount = budgeted.filter((x) => envelopeStatus(x.cap, x.spent).state === 'over').length;
  const closeCount = budgeted.filter((x) => envelopeStatus(x.cap, x.spent).state === 'close').length;
  const month$ = o && o.total_cap > 0 ? envelopeStatus(o.total_cap, o.total_spent) : null;

  return (
    <View style={s.fill}>
      <Screen onRefresh={() => overview.refetch()} refreshing={overview.isRefetching} bottomSpace={ADD_BUTTON_SPACE}>
        <Stack.Screen options={{ title: t.tabs.overview }} />
        <OfflineBanner />
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
                  <Text maxFontSizeMultiplier={1.5} style={[s.heroAmount, { color: o.total_cap > 0 ? (o.net >= 0 ? c.green : c.red) : c.label }]}>
                    {money(o.total_cap > 0 ? Math.abs(o.net) : o.total_spent, cur)}
                  </Text>
                  {o.total_cap > 0 ? (
                    <>
                      <ProgressBar pct={totalPct ?? 0} color={budgetTone(totalPct, c)} />
                      <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>
                        {t.common.of(money(o.total_spent, cur), money(o.total_cap, cur))}
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
              ) : o.total_cap > 0 && month$ && month$.state !== 'none' ? (
                <>
                  <Text style={[s.heroLabel, { color: c.text2 }]}>{o.net >= 0 ? t.overview.leftThisMonth : t.overview.overThisMonth}</Text>
                  {/* The number in ink: the state is said under it, not painted over it (D1). */}
                  {/* F3: the biggest number on screen grows only to 150% with the system text size. */}
                  <Text maxFontSizeMultiplier={1.5} style={[s.heroAmount, { color: o.net >= 0 ? c.text : c.over }]}>{money(Math.abs(o.net), cur)}</Text>
                  {o.net > 0 ? (
                    <Text style={[s.heroDay, { color: c.text2 }]}>
                      <Text style={[s.heroDayAmount, { color: c.text }]}>{money(perDay(o.net, days), cur)}</Text>
                      {` ${t.overview.perDayPlain} · ${t.overview.daysToGo(days)}`}
                    </Text>
                  ) : null}
                  <View style={[s.track, { backgroundColor: c.fill }]}>
                    <View
                      style={[
                        s.trackFill,
                        { width: `${Math.min(100, month$.pct)}%`, backgroundColor: month$.state === 'over' ? c.overBar : month$.state === 'close' ? c.closeBar : c.text },
                      ]}
                    />
                  </View>
                  <View
                    style={[s.say, { backgroundColor: month$.state === 'over' ? c.overSoft : month$.state === 'close' ? c.closeSoft : c.fill }]}
                    accessibilityRole="text">
                    <Icon
                      name={month$.state === 'ok' ? 'checkmark.circle' : 'exclamationmark.triangle.fill'}
                      size={17}
                      color={month$.state === 'over' ? c.over : month$.state === 'close' ? c.close : c.text}
                    />
                    <Text style={[s.sayText, { color: month$.state === 'over' ? c.over : month$.state === 'close' ? c.close : c.text }]}>
                      {month$.state === 'over'
                        ? t.envelope.monthOver(money(-month$.left, cur))
                        : month$.state === 'close'
                          ? t.envelope.monthClose(Math.round(month$.pct))
                          : t.envelope.monthFine}
                    </Text>
                    {month$.state === 'ok' && overCount > 0 ? (
                      <Text style={[s.pill, { backgroundColor: c.overSoft, color: c.over }]}>{t.envelope.someOver(overCount)}</Text>
                    ) : null}
                    {month$.state === 'ok' && closeCount > 0 ? (
                      <Text style={[s.pill, { backgroundColor: c.closeSoft, color: c.close }]}>{t.envelope.someClose(closeCount)}</Text>
                    ) : null}
                  </View>
                  {forecast && o.forecast ? (
                    <ForecastLine f={o.forecast} summary={forecast} currency={cur} open={showForecast} onToggle={() => setShowForecast((x) => !x)} />
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>{t.overview.spentThisMonth}</Text>
                  <Text maxFontSizeMultiplier={1.5} style={[s.heroAmount, { color: c.label }]}>{money(o.total_spent, cur)}</Text>
                  <Pressable onPress={() => router.push('/settings/categories')} accessibilityRole="button" hitSlop={8}>
                    <Text style={[s.heroMeta, { color: c.tint }]}>{t.overview.setBudgetsLink}</Text>
                  </Pressable>
                  {forecast && o.forecast ? (
                    <ForecastLine f={o.forecast} summary={forecast} currency={cur} open={showForecast} onToggle={() => setShowForecast((x) => !x)} />
                  ) : null}
                </>
              )}
            </View>

            {!past ? <InstallBanner /> : null}
            {!past ? <CaptureBanner /> : null}
            {!past ? <SetupCard /> : null}

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
                    left={<CategoryIcon symbol={cat.sf_symbol} categoryId={cat.id} />}
                    title={cat.name}
                    right={<Badge text={t.overview.noBudget} color={c.orange} />}
                    onPress={() => router.push({ pathname: '/settings/category', params: { id: cat.id } })}
                    last={i === noBudgetFlags.length - 1}
                  />
                ))}
              </Section>
            ) : null}

            {budgeted.length > 0 ? (
              <>
                <View style={s.groupHead}>
                  <Text style={[s.groupTitle, { color: c.text }]} accessibilityRole="header">
                    {t.envelope.envelopes}
                  </Text>
                  {past ? (
                    <Text style={[s.groupMeta, { color: c.text2 }]}>{t.envelope.ofTotal(money(o.total_spent, cur), money(o.total_cap, cur))}</Text>
                  ) : (
                    <Pressable onPress={() => router.push('/settings/budgets')} accessibilityRole="button" hitSlop={12}>
                      <Text style={[s.groupAction, { color: c.action }]}>{t.budgets.open}</Text>
                    </Pressable>
                  )}
                </View>
                <EnvelopeGrid>{budgeted.map((cat) => envelopeFor(cat, cat.cap))}</EnvelopeGrid>
                {/* C3: how the budgets sit against income, under the envelopes rather than in the hero. */}
                {!past && plan.kind !== 'none' ? (
                  <Pressable onPress={() => router.push('/settings/income')} accessibilityRole="button" hitSlop={6}>
                    <Text style={[s.groupFooter, { color: plan.health === 'over' ? c.over : plan.health === 'thin' ? c.close : c.text2 }]}>
                      {plan.kind === 'over'
                        ? t.overview.budgetsOverIncome(money(-plan.unassigned, cur))
                        : t.overview.unassignedToSavings(money(plan.unassigned, cur), plan.savingsPct)}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {unbudgetedWithSpend.length > 0 ? (
              <>
                <View style={s.groupHead}>
                  <Text style={[s.groupTitle, { color: c.text }]} accessibilityRole="header">
                    {t.overview.withoutBudget}
                  </Text>
                </View>
                <EnvelopeGrid>{unbudgetedWithSpend.map((cat) => envelopeFor(cat, null))}</EnvelopeGrid>
                {past ? null : <Text style={[s.groupFooter, { color: c.text2 }]}>{t.overview.withoutBudgetFooter}</Text>}
              </>
            ) : null}

            {/* Checked less often than the month itself, so it sits below the budgets. */}
            <Section>
              <Row
                left={<CategoryIcon symbol="banknote" />}
                title={t.overview.savings}
                value={money(o.savings_balance, cur)}
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
      <MenuSheet
        open={menuFor != null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.name}
        items={
          menuFor
            ? [
                { label: t.envelope.editBudget, icon: 'pencil', onPress: () => setBudgetFor(menuFor) },
                { label: t.envelope.expenses, icon: 'list.bullet', onPress: () => router.push({ pathname: '/transactions', params: { category: menuFor.id } }) },
                { label: t.envelope.editEnvelope, icon: 'tag', onPress: () => actions.edit(menuFor) },
                { label: t.common.delete, icon: 'trash', destructive: true, onPress: () => actions.remove(menuFor) },
              ]
            : []
        }
      />
      <BudgetSheet cat={budgetFor} look={budgetFor ? own.get(budgetFor.id) : undefined} currency={cur} onClose={() => setBudgetFor(null)} />
    </View>
  );
}

function ForecastLine({
  f,
  summary,
  currency,
  open,
  onToggle,
}: {
  f: Forecast;
  summary: NonNullable<ForecastSummary>;
  currency: string;
  open: boolean;
  onToggle: () => void;
}) {
  const c = useColors();
  const sum = (n: number) => money(n, currency);
  const text =
    summary.kind === 'over'
      ? t.overview.forecastOver(sum(summary.amount))
      : summary.kind === 'under'
        ? t.overview.forecastUnder(sum(summary.amount))
        : t.overview.forecastSpend(sum(summary.total));
  const color = summary.kind === 'over' ? c.red : summary.kind === 'under' ? c.green : c.secondaryLabel;
  const line = (label: string, amount: number, strong?: boolean) => (
    <View style={s.forecastRow}>
      <Text style={[s.heroMeta, { color: strong ? c.label : c.secondaryLabel, fontWeight: strong ? '600' : '400' }]}>{label}</Text>
      <Text style={[s.heroMeta, { color: strong ? c.label : c.secondaryLabel, fontWeight: strong ? '600' : '400' }]}>{sum(amount)}</Text>
    </View>
  );
  return (
    <View style={[s.forecast, { borderTopColor: c.separator }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? t.overview.forecastHide : t.overview.forecastShow}
        hitSlop={6}
        style={s.forecastHead}>
        <Text style={[s.forecastText, { color }]}>{text}</Text>
        <Icon name={open ? 'chevron.up' : 'chevron.down'} size={13} color={c.secondaryLabel} />
      </Pressable>
      {open ? (
        <View style={s.forecastBody}>
          {line(t.overview.forecastSpent, f.spent)}
          {line(t.overview.forecastUpcoming, f.upcoming)}
          {line(t.overview.forecastRest, f.rest)}
          {line(t.overview.forecastTotal, f.total, true)}
          <Text style={[s.forecastNote, { color: c.secondaryLabel }]}>
            {f.day < 5 ? t.overview.forecastNoteEarly(f.day, f.days) : t.overview.forecastNote(f.day, f.days)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  hero: { marginHorizontal: tokens.space[4], marginTop: tokens.space[3], borderRadius: tokens.radius.card, padding: tokens.space[5], gap: tokens.space[1] },
  heroLabel: { ...tokens.type.secondary, fontSize: 16 },
  heroAmount: { ...tokens.type.display, letterSpacing: -0.5 },
  heroDay: { ...tokens.type.secondary },
  heroDayAmount: { ...moneyText, fontSize: 18, fontWeight: '600' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: tokens.space[2] },
  trackFill: { height: 8, borderRadius: 4 },
  say: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.space[2], borderRadius: tokens.radius.chip + 2, paddingHorizontal: tokens.space[3], paddingVertical: tokens.space[2], marginTop: tokens.space[2] },
  sayText: { ...tokens.type.secondary, fontWeight: '700', flexShrink: 1 },
  pill: { ...tokens.type.caption, fontWeight: '700', borderRadius: tokens.radius.chip, paddingHorizontal: tokens.space[2], overflow: 'hidden' },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginHorizontal: tokens.space[5], marginTop: tokens.space[6], marginBottom: tokens.space[2] },
  groupTitle: { ...tokens.type.heading },
  groupMeta: { ...tokens.type.caption, ...moneyText },
  groupAction: { ...tokens.type.label, fontSize: 16, fontWeight: '600' },
  groupFooter: { ...tokens.type.caption, marginHorizontal: tokens.space[5], marginTop: tokens.space[2] },
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12, rowGap: 2 },
  heroMeta: { fontSize: 14, ...moneyText },
  forecast: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4, paddingTop: 12, gap: 8 },
  forecastHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  forecastText: { fontSize: 15, fontWeight: '600', flexShrink: 1, ...moneyText },
  forecastBody: { gap: 4 },
  forecastRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  forecastNote: { fontFamily: fontFamily.body, fontSize: 12, marginTop: 4, lineHeight: 16 },
});
