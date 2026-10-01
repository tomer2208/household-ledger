import { router, Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useRecurring } from '@/api/queries';
import { Badge, CategoryIcon, Empty, Row, Screen, Section } from '@/components/ui';
import { monthLabel, monthOfDay, shortDate } from '@/lib/dates';
import { installmentsPaid } from '@/lib/installments';
import { formatMoney } from '@/lib/money';
import { useColors } from '@/lib/theme';

const EVERY: Record<number, string> = { 1: 'Monthly', 2: 'Every 2 months', 3: 'Quarterly', 6: 'Twice a year', 12: 'Yearly' };

export default function RecurringScreen() {
  const c = useColors();
  const rules = useRecurring();
  const list = rules.data ?? [];
  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Recurring',
          headerLargeTitle: false,
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings/recurring-edit')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Add recurring expense">
              <Text style={{ color: c.tint, fontSize: 17 }}>Add</Text>
            </Pressable>
          ),
        }}
      />
      {list.length === 0 && !rules.isLoading ? (
        <Empty
          icon="calendar.badge.clock"
          title="No recurring expenses"
          message="Add standing orders, subscriptions and bills. Variable bills like electricity are logged as an estimate you update when the real amount arrives."
          action={{ label: 'Add Recurring Expense', onPress: () => router.push('/settings/recurring-edit') }}
        />
      ) : (
        <Section footer="Logged automatically on their day. Estimates count toward the budget until you enter the real amount.">
          {list.map((r, i) => (
            <Row
              key={r.id}
              left={<CategoryIcon symbol={r.categories?.sf_symbol ?? 'tag'} />}
              title={r.title}
              subtitle={
                r.installment_count && r.installment_first
                  ? // P1-2: installments say how far along they are and when they end.
                    `${installmentsPaid(r.installment_first, r.next_run_date, r.installment_count)} of ${r.installment_count} paid` +
                    (r.end_date ? ` · ends ${monthLabel(monthOfDay(r.end_date))}` : '')
                  : `${EVERY[r.interval_months]} on day ${r.day_of_month}${r.next_run_date ? ` · next ${shortDate(r.next_run_date)}` : ''}`
              }
              value={formatMoney(r.amount_minor, r.currency)}
              right={
                r.paused ? (
                  <Badge text="Paused" color={c.secondaryLabel} />
                ) : r.installment_count ? (
                  <Badge text="Installments" color={c.secondaryLabel} />
                ) : r.amount_kind === 'estimated' ? (
                  <Badge text="Est." color={c.secondaryLabel} />
                ) : undefined
              }
              onPress={() => router.push({ pathname: '/settings/recurring-edit', params: { id: r.id } })}
              last={i === list.length - 1}
            />
          ))}
        </Section>
      )}
    </Screen>
  );
}
