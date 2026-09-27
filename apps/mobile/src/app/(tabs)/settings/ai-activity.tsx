import { Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { useAgentRuns, useAiUsage } from '@/api/queries';
import { Badge, Empty, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { shortDate, timeLabel } from '@/lib/dates';
import { budgetTone, useColors } from '@/lib/theme';

const AGENT = { classifier: 'Categorize purchase', monthly_report: 'Monthly report', advisor: 'Suggestions' } as const;

// BLUEPRINT §4.5: every AI call, its outcome and cost, visible to the people it's about.
export default function AiActivity() {
  const c = useColors();
  const runs = useAgentRuns();
  const usage = useAiUsage().data;
  const usedPct = usage && usage.cap_usd > 0 ? (usage.cost_usd * 100) / usage.cap_usd : 0;
  const list = runs.data ?? [];
  const tone = (s: string) => (s === 'ok' ? c.green : s === 'fallback' ? c.secondaryLabel : c.orange);

  return (
    <Screen onRefresh={() => runs.refetch()} refreshing={runs.isRefetching}>
      <Stack.Screen options={{ title: 'AI Activity', headerLargeTitle: false }} />
      {usage ? (
        <Section
          title="This month"
          footer={
            usedPct >= 100
              ? 'The monthly AI allowance is used up. Categories and reports use the built-in text until next month.'
              : 'Each household has a monthly AI allowance. Past it, the app switches to its built-in text until next month.'
          }>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
            <Text style={{ color: c.label, fontSize: 17, fontVariant: ['tabular-nums'] }}>
              ${usage.cost_usd.toFixed(2)} of ${usage.cap_usd.toFixed(2)} used
            </Text>
            <ProgressBar pct={usedPct} color={budgetTone(usedPct, c)} />
          </View>
        </Section>
      ) : null}
      {list.length === 0 && !runs.isLoading ? (
        <Empty icon="sparkles" title="No AI activity yet" />
      ) : (
        <Section footer="“fallback” means the app used its built-in text instead of calling the AI (AI off, allowance used up, or no API key yet).">
          {list.map((r, i) => (
            <Row
              key={r.id}
              title={AGENT[r.agent]}
              subtitle={`${shortDate(r.created_at)} ${timeLabel(r.created_at)} · ${r.model}${
                r.input_tokens ? ` · ${r.input_tokens + (r.output_tokens ?? 0)} tokens` : ''
              }${r.latency_ms ? ` · ${(r.latency_ms / 1000).toFixed(1)}s` : ''}`}
              right={<Badge text={r.status} color={tone(r.status)} />}
              last={i === list.length - 1}
            />
          ))}
        </Section>
      )}
      {list.some((r) => r.error) ? (
        <Text style={{ color: c.secondaryLabel, marginHorizontal: 32, marginTop: 8, fontSize: 12 }}>
          Last error: {list.find((r) => r.error)?.error}
        </Text>
      ) : null}
    </Screen>
  );
}
