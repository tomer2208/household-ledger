import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useHousehold, useMonthCloses, useMonthlyReport, useRequestReport } from '@/api/queries';
import { CapBars, CategoryDonut, SavingsLine, TrendLine } from '@/components/charts';
import { DetailSkeleton } from '@/components/skeleton';
import { Button, ErrorText, Icon, LoadingState, ProgressBar, Screen, Section } from '@/components/ui';
import { monthLabel } from '@/lib/dates';
import { fill, flatten } from '@/lib/fill';
import { lang, t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { money } from '@/components/money-text';
import { budgetTone, moneyText, useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

const TONE_ICON = { positive: 'checkmark.circle.fill', warning: 'exclamationmark.triangle.fill', neutral: 'sparkles' } as const;

// US-A1: SQL numbers + charts always; the AI's words when they passed validation,
// otherwise the template written from the same numbers.
export default function MonthReport() {
  const c = useColors();
  const { month } = useLocalSearchParams<{ month: string }>();
  const cur = useHousehold().data?.household?.base_currency ?? 'ILS';
  const report = useMonthlyReport(month);
  const close = useMonthCloses().data?.find((x) => x.budget_month === month);
  const regenerate = useRequestReport();
  const r = report.data;
  const writing = r && (r.status === 'pending' || r.status === 'generating');

  const m = r?.metrics;
  // P1-6: the report in this member's language when the server wrote one; older reports have one.
  const mine = r?.narratives?.[lang()];
  const narrative = mine ?? r?.narrative ?? null;
  // The AI writes the household's main language; another language's version is the template.
  const byAi = r?.status === 'ready' && (!mine || mine.headline === r.narrative?.headline);
  const values = m ? flatten({ ...m, extra: narrative?.extra ?? {} }) : {};
  const say = (text: string) => fill(text, values, m?.currency ?? cur);
  const catName = (key: string) => m?.categories.find((x) => x.key === key)?.name ?? '';

  return (
    <Screen onRefresh={() => report.refetch()} refreshing={report.isRefetching}>
      <Stack.Screen options={{ title: monthLabel(month), headerLargeTitle: false }} />
      <ErrorText error={regenerate.error} />
      {report.isPending || (report.error && !r) ? (
        <LoadingState error={report.error} onRetry={() => report.refetch()} retrying={report.isFetching} skeleton={<DetailSkeleton />} />
      ) : null}

      {close ? (
        <View style={[s.hero, { backgroundColor: c.cell }]}>
          <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>{close.net_minor >= 0 ? t.reports.moved : t.reports.taken}</Text>
          <Text style={[s.heroAmount, { color: close.net_minor >= 0 ? c.green : c.red }]}>{money(Math.abs(close.net_minor), cur)}</Text>
          <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>
            {t.reports.spentOfBudgeted(money(close.total_spent_minor, cur), money(close.total_cap_minor, cur))}
          </Text>
          {/* P1-16: what went into, or came out of, periodic payments' funds */}
          {close.reserved_minor !== 0 ? (
            <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>
              {t.reports.reserved(money(Math.abs(close.reserved_minor), cur), close.reserved_minor > 0 ? 'in' : 'out')}
            </Text>
          ) : null}
          {/* P1-14: what stayed with its category instead of moving to savings */}
          {close.carried_minor !== 0 ? (
            <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>
              {t.reports.carried(money(Math.abs(close.carried_minor), cur), close.carried_minor > 0 ? 'left' : 'over')}
            </Text>
          ) : null}
        </View>
      ) : null}

      {writing ? (
        <View style={s.writing}>
          <ActivityIndicator />
          <Text style={{ fontFamily: fontFamily.body, color: c.secondaryLabel }}>{t.reports.writing}</Text>
        </View>
      ) : null}

      {narrative && !writing ? (
        <View style={[s.story, { backgroundColor: c.cell }]}>
          <View style={s.badgeRow}>
            <Icon name="sparkles" size={14} color={c.secondaryLabel} />
            <Text style={[s.badge, { color: c.secondaryLabel }]}>{byAi ? t.reports.byAi : t.reports.summary}</Text>
          </View>
          <Text style={[s.headline, { color: c.label }]}>{say(narrative.headline)}</Text>
          <Text style={[s.summary, { color: c.label }]}>{say(narrative.summary)}</Text>
          {/* D1: the hero already says what moved to savings; a highlight that only repeats that
              amount is left out, so the month isn't told three times. */}
          {narrative.highlights
            .filter((h) => !(close && close.net_minor !== 0 && say(h.text).includes(formatMoney(Math.abs(close.net_minor), cur))))
            .map((h, i) => (
            <View key={i} style={s.highlight}>
              <Icon name={TONE_ICON[h.tone]} size={16} color={h.tone === 'positive' ? c.green : h.tone === 'warning' ? c.orange : c.tint} />
              <Text style={[s.highlightText, { color: c.label }]}>{say(h.text)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {m ? (
        <>
          {/* P1-11: a category opens its expenses that month; a month opens its Overview. */}
          <Text style={[s.chartHint, { color: c.secondaryLabel }]}>{t.charts.tapHint}</Text>
          <CategoryDonut m={m} onCategory={(id) => router.push({ pathname: '/transactions', params: id ? { category: id, month } : { month } })} />
          <CapBars m={m} onCategory={(id) => router.push({ pathname: '/transactions', params: { category: id, month } })} />
          <TrendLine m={m} onMonth={(mo) => router.push({ pathname: '/overview', params: { month: mo } })} />
          <SavingsLine m={m} />
        </>
      ) : null}

      {narrative?.category_notes.length ? (
        <Section title={t.reports.categoryNotes}>
          {narrative.category_notes.map((n, i) => (
            <View key={i} style={[s.note, i < narrative.category_notes.length - 1 && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[s.noteTitle, { color: c.label }]}>{catName(n.category_key)}</Text>
              <Text style={[s.noteText, { color: c.secondaryLabel }]}>{say(n.text)}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {narrative?.recommendations.length ? (
        <Section title={t.reports.next}>
          {narrative.recommendations.map((n, i) => (
            <View key={i} style={s.note}>
              <Text style={[s.noteText, { color: c.label }]}>{say(n.text)}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {m && !narrative ? (
        <Section title={t.reports.byCategory}>
          {m.categories.map((x) => (
            <View key={x.key} style={s.note}>
              <Text style={[s.noteTitle, { color: c.label }]}>{x.name}</Text>
              {x.pct != null ? <ProgressBar pct={x.pct} color={budgetTone(x.pct, c)} /> : null}
            </View>
          ))}
        </Section>
      ) : null}

      {!r && !report.isPending && !report.error ? (
        <Text style={[s.hint, { color: c.secondaryLabel }]}>{t.reports.none}</Text>
      ) : null}

      <View style={s.actions}>
        <Button
          title={r ? t.reports.rewrite : t.reports.write}
          kind="plain"
          loading={regenerate.isPending}
          disabled={!!writing}
          onPress={() => regenerate.mutate(month)}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  chartHint: { fontFamily: fontFamily.body, fontSize: 13, marginHorizontal: 32, marginTop: 20 },
  hero: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 20, gap: 6 },
  heroLabel: { fontFamily: fontFamily.body, fontSize: 15 },
  heroAmount: { fontSize: 36, fontWeight: '700', ...moneyText },
  heroMeta: { fontFamily: fontFamily.body, fontSize: 14, fontVariant: ['tabular-nums'] },
  writing: { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center', padding: 24 },
  story: { marginHorizontal: 16, marginTop: 16, borderRadius: 14, padding: 20, gap: 12 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { fontFamily: fontFamily.body, fontSize: 13, fontWeight: '600' },
  headline: { fontFamily: fontFamily.body, fontSize: 22, fontWeight: '700' },
  summary: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 23 },
  highlight: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  highlightText: { fontFamily: fontFamily.body, flex: 1, fontSize: 15, lineHeight: 21 },
  note: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  noteTitle: { fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
  noteText: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 },
  hint: { textAlign: 'center', marginTop: 24 },
  actions: { marginHorizontal: 16, marginTop: 20 },
});
