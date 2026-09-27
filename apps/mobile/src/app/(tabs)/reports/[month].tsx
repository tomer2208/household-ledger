import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useHousehold, useMonthCloses, useMonthlyReport, useRequestReport } from '@/api/queries';
import { CapBars, CategoryDonut, SavingsLine, TrendLine } from '@/components/charts';
import { Button, ErrorText, Icon, ProgressBar, Screen, Section } from '@/components/ui';
import { monthLabel } from '@/lib/dates';
import { fill, flatten } from '@/lib/fill';
import { formatMoney } from '@/lib/money';
import { budgetTone, useColors } from '@/lib/theme';

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
  const values = m ? flatten({ ...m, extra: r?.narrative?.extra ?? {} }) : {};
  const t = (s: string) => fill(s, values, m?.currency ?? cur);
  const catName = (key: string) => m?.categories.find((x) => x.key === key)?.name ?? '';

  return (
    <Screen onRefresh={() => report.refetch()} refreshing={report.isRefetching}>
      <Stack.Screen options={{ title: monthLabel(month), headerLargeTitle: false }} />
      <ErrorText error={report.error ?? regenerate.error} />

      {close ? (
        <View style={[s.hero, { backgroundColor: c.cell }]}>
          <Text style={[s.heroLabel, { color: c.secondaryLabel }]}>{close.net_minor >= 0 ? 'Moved to savings' : 'Taken from savings'}</Text>
          <Text style={[s.heroAmount, { color: close.net_minor >= 0 ? c.green : c.red }]}>{formatMoney(Math.abs(close.net_minor), cur)}</Text>
          <Text style={[s.heroMeta, { color: c.secondaryLabel }]}>
            {formatMoney(close.total_spent_minor, cur)} spent of {formatMoney(close.total_cap_minor, cur)} budgeted
          </Text>
        </View>
      ) : null}

      {writing ? (
        <View style={s.writing}>
          <ActivityIndicator />
          <Text style={{ color: c.secondaryLabel }}>Writing this month’s report…</Text>
        </View>
      ) : null}

      {r?.narrative && !writing ? (
        <View style={[s.story, { backgroundColor: c.cell }]}>
          <View style={s.badgeRow}>
            <Icon name="sparkles" size={14} color={c.secondaryLabel} />
            <Text style={[s.badge, { color: c.secondaryLabel }]}>{r.status === 'ready' ? 'Written by AI from your numbers' : 'Summary'}</Text>
          </View>
          <Text style={[s.headline, { color: c.label }]}>{t(r.narrative.headline)}</Text>
          <Text style={[s.summary, { color: c.label }]}>{t(r.narrative.summary)}</Text>
          {r.narrative.highlights.map((h, i) => (
            <View key={i} style={s.highlight}>
              <Icon name={TONE_ICON[h.tone]} size={16} color={h.tone === 'positive' ? c.green : h.tone === 'warning' ? c.orange : c.tint} />
              <Text style={[s.highlightText, { color: c.label }]}>{t(h.text)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {m ? (
        <>
          <CategoryDonut m={m} />
          <CapBars m={m} />
          <TrendLine m={m} />
          <SavingsLine m={m} />
        </>
      ) : null}

      {r?.narrative?.category_notes.length ? (
        <Section title="Category notes">
          {r.narrative.category_notes.map((n, i) => (
            <View key={i} style={[s.note, i < r.narrative!.category_notes.length - 1 && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[s.noteTitle, { color: c.label }]}>{catName(n.category_key)}</Text>
              <Text style={[s.noteText, { color: c.secondaryLabel }]}>{t(n.text)}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {r?.narrative?.recommendations.length ? (
        <Section title="What to do next">
          {r.narrative.recommendations.map((n, i) => (
            <View key={i} style={s.note}>
              <Text style={[s.noteText, { color: c.label }]}>{t(n.text)}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {m && !r?.narrative ? (
        <Section title="By category">
          {m.categories.map((x) => (
            <View key={x.key} style={s.note}>
              <Text style={[s.noteTitle, { color: c.label }]}>{x.name}</Text>
              {x.pct != null ? <ProgressBar pct={x.pct} color={budgetTone(x.pct, c)} /> : null}
            </View>
          ))}
        </Section>
      ) : null}

      {!r && !report.isLoading ? (
        <Text style={[s.hint, { color: c.secondaryLabel }]}>No report for this month yet.</Text>
      ) : null}

      <View style={s.actions}>
        <Button
          title={r ? 'Rewrite Report' : 'Write Report'}
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
  hero: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 18, gap: 6 },
  heroLabel: { fontSize: 15 },
  heroAmount: { fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroMeta: { fontSize: 14, fontVariant: ['tabular-nums'] },
  writing: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 24 },
  story: { marginHorizontal: 16, marginTop: 16, borderRadius: 14, padding: 18, gap: 10 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  headline: { fontSize: 22, fontWeight: '700' },
  summary: { fontSize: 16, lineHeight: 23 },
  highlight: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  highlightText: { flex: 1, fontSize: 15, lineHeight: 21 },
  note: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  noteTitle: { fontSize: 15, fontWeight: '600' },
  noteText: { fontSize: 15, lineHeight: 21 },
  hint: { textAlign: 'center', marginTop: 24 },
  actions: { marginHorizontal: 16, marginTop: 20 },
});
