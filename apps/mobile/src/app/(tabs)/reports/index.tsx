import { router } from 'expo-router';
import { Text } from 'react-native';

import { useHousehold, useMonthCloses, useOverview } from '@/api/queries';
import { ListSkeleton } from '@/components/skeleton';
import { Empty, LoadingState, Row, Screen, Section } from '@/components/ui';
import { monthLabel } from '@/lib/dates';
import { t } from '@/lib/i18n';
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
      {overview.data ? (
        <Section title={t.reports.inProgress} footer={t.reports.inProgressFooter}>
          <Row
            title={monthLabel(overview.data.month)}
            subtitle={t.reports.spentSoFar(formatMoney(overview.data.total_spent, cur))}
            value={overview.data.total_cap > 0 ? formatMoney(overview.data.net, cur, { sign: true }) : undefined}
            onPress={() => router.push('/overview')}
            last
          />
        </Section>
      ) : null}

      {list.length > 0 ? (
        <Section title={t.reports.closedMonths}>
          {list.map((m, i) => (
            <Row
              key={m.budget_month}
              title={monthLabel(m.budget_month)}
              subtitle={t.common.of(formatMoney(m.total_spent_minor, cur), formatMoney(m.total_cap_minor, cur))}
              right={
                <Text style={{ color: m.net_minor >= 0 ? c.green : c.red, fontSize: 17, ...moneyText }}>
                  {formatMoney(m.net_minor, cur, { sign: true })}
                </Text>
              }
              onPress={() => router.push({ pathname: '/reports/[month]', params: { month: m.budget_month } })}
              last={i === list.length - 1}
            />
          ))}
        </Section>
      ) : !closes.data ? (
        <LoadingState error={closes.error} onRetry={() => closes.refetch()} retrying={closes.isFetching} skeleton={<ListSkeleton rows={3} />} />
      ) : (
        <Empty icon="doc.text.magnifyingglass" title={t.reports.emptyTitle} message={t.reports.emptyMessage} />
      )}
    </Screen>
  );
}
