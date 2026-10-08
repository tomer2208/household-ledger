import { Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { useAgentRuns, useAiUsage } from '@/api/queries';
import { Badge, Empty, ProgressBar, Row, Screen, Section } from '@/components/ui';
import { shortDate, timeLabel } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { budgetTone, useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

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
      <Stack.Screen options={{ title: t.settings.aiActivity, headerLargeTitle: false }} />
      {usage ? (
        <Section
          title={t.month.thisMonth}
          footer={usedPct >= 100 ? t.aiActivity.usedUp : t.aiActivity.allowance}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
            <Text style={{ fontFamily: fontFamily.body, color: c.label, fontSize: 17, fontVariant: ['tabular-nums'] }}>
              {t.aiActivity.usedPct(Math.round(usedPct))}
            </Text>
            <ProgressBar pct={usedPct} color={budgetTone(usedPct, c)} />
          </View>
        </Section>
      ) : null}
      {list.length === 0 && !runs.isLoading ? (
        <Empty icon="sparkles" title={t.aiActivity.empty} />
      ) : (
        <Section footer={t.aiActivity.fallbackFooter}>
          {list.map((r, i) => (
            <Row
              key={r.id}
              title={t.aiActivity.agent[r.agent]}
              // D1: no model names, tokens or seconds; just when, and what happened in words.
              subtitle={`${shortDate(r.created_at)} ${timeLabel(r.created_at)}`}
              right={<Badge text={t.aiActivity.status(r.status)} color={tone(r.status)} />}
              last={i === list.length - 1}
            />
          ))}
        </Section>
      )}
      {list.some((r) => r.error) ? (
        <Text style={{ fontFamily: fontFamily.body, color: c.secondaryLabel, marginHorizontal: 32, marginTop: 8, fontSize: 13 }}>
          {t.aiActivity.lastError(list.find((r) => r.error)?.error ?? '')}
        </Text>
      ) : null}
    </Screen>
  );
}
