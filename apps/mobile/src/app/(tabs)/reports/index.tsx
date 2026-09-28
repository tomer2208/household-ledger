import { router } from 'expo-router';
import { Text } from 'react-native';

import { useHousehold, useMonthCloses, useOverview } from '@/api/queries';
import { Empty, ErrorText, Row, Screen, Section } from '@/components/ui';
import { monthLabel } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { moneyText, useColors } from '@/lib/theme';

// Phase 3 shows each closed month's numbers straight from month_closes. The AI narrative
// and the four charts (BLUEPRINT US-A1) plug into the month screen in Phase 4.
export default function ReportsScreen() {
  const c = useColors();
  const closes = useMonthCloses();
  const overview = useOverview();
  const cur = useHousehold().data?.household?.base_currency ?? 'ILS';
  const list = closes.data ?? [];

  return (
    <Screen onRefresh={() => closes.refetch()} refreshing={closes.isRefetching}>
      <ErrorText error={closes.error} />
      {overview.data ? (
        <Section title="In progress" footer="The report is written on the 1st, after the month closes.">
          <Row
            title={monthLabel(overview.data.month)}
            subtitle={`${formatMoney(overview.data.total_spent, cur)} spent so far`}
            value={
              overview.data.total_cap > 0
                ? overview.data.net >= 0
                  ? `+${formatMoney(overview.data.net, cur)}`
                  : `−${formatMoney(-overview.data.net, cur)}`
                : undefined
            }
            onPress={() => router.push('/overview')}
            last
          />
        </Section>
      ) : null}

      {list.length > 0 ? (
        <Section title="Closed months">
          {list.map((m, i) => (
            <Row
              key={m.budget_month}
              title={monthLabel(m.budget_month)}
              subtitle={`${formatMoney(m.total_spent_minor, cur)} of ${formatMoney(m.total_cap_minor, cur)}`}
              right={
                <Text style={{ color: m.net_minor >= 0 ? c.green : c.red, fontSize: 17, ...moneyText }}>
                  {m.net_minor >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(m.net_minor), cur)}
                </Text>
              }
              onPress={() => router.push({ pathname: '/reports/[month]', params: { month: m.budget_month } })}
              last={i === list.length - 1}
            />
          ))}
        </Section>
      ) : closes.isLoading ? null : (
        <Empty icon="doc.text.magnifyingglass" title="No reports yet" message="Your first monthly report arrives after this month closes." />
      )}
    </Screen>
  );
}
