import { Stack } from 'expo-router';
import { Text } from 'react-native';

import { useAgentRuns } from '@/api/queries';
import { Badge, Empty, Row, Screen, Section } from '@/components/ui';
import { shortDate, timeLabel } from '@/lib/dates';
import { useColors } from '@/lib/theme';

const AGENT = { classifier: 'Categorize purchase', monthly_report: 'Monthly report', advisor: 'Suggestions' } as const;

// BLUEPRINT §4.5: every AI call, its outcome and cost, visible to the people it's about.
export default function AiActivity() {
  const c = useColors();
  const runs = useAgentRuns();
  const list = runs.data ?? [];
  const tone = (s: string) => (s === 'ok' ? c.green : s === 'fallback' ? c.secondaryLabel : c.orange);

  return (
    <Screen onRefresh={() => runs.refetch()} refreshing={runs.isRefetching}>
      <Stack.Screen options={{ title: 'AI Activity', headerLargeTitle: false }} />
      {list.length === 0 && !runs.isLoading ? (
        <Empty icon="sparkles" title="No AI activity yet" />
      ) : (
        <Section footer="“fallback” means the app used its built-in text instead of calling the AI (AI off, or no API key yet).">
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
