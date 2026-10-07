import { router, Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useRecurring } from '@/api/queries';
import { Badge, CategoryIcon, Empty, Row, Screen, Section } from '@/components/ui';
import { monthLabel, monthOfDay, shortDate } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { installmentsPaid } from '@/lib/installments';
import { formatMoney } from '@/lib/money';
import { useColors } from '@/lib/theme';

export default function RecurringScreen() {
  const c = useColors();
  const rules = useRecurring();
  const list = rules.data ?? [];
  return (
    <Screen>
      <Stack.Screen
        options={{
          title: t.settings.recurring,
          headerLargeTitle: false,
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings/recurring-edit')} hitSlop={12} accessibilityRole="button" accessibilityLabel={t.recurring.addA11y}>
              <Text style={{ color: c.tint, fontSize: 17 }}>{t.categories.add}</Text>
            </Pressable>
          ),
        }}
      />
      {list.length === 0 && !rules.isLoading ? (
        <Empty
          icon="calendar.badge.clock"
          title={t.recurring.emptyTitle}
          message={t.recurring.emptyMessage}
          action={{ label: t.recurring.addButton, onPress: () => router.push('/settings/recurring-edit') }}
        />
      ) : (
        <Section footer={t.recurring.footer}>
          {list.map((r, i) => (
            <Row
              key={r.id}
              left={<CategoryIcon symbol={r.categories?.sf_symbol ?? 'tag'} categoryId={r.category_id} />}
              title={r.title}
              subtitle={
                r.installment_count && r.installment_first
                  ? // P1-2: installments say how far along they are and when they end.
                    t.recurring.paid(installmentsPaid(r.installment_first, r.next_run_date, r.installment_count), r.installment_count) +
                    (r.end_date ? ` · ${t.recurring.ends(monthLabel(monthOfDay(r.end_date)))}` : '')
                  : t.recurring.schedule(t.recurring.every[r.interval_months] ?? '', r.day_of_month) +
                    (r.next_run_date ? ` · ${t.recurring.next(shortDate(r.next_run_date))}` : '')
              }
              value={formatMoney(r.amount_minor, r.currency)}
              right={
                r.paused ? (
                  <Badge text={t.recurring.paused} color={c.secondaryLabel} />
                ) : r.installment_count ? (
                  <Badge text={t.detail.installments} color={c.secondaryLabel} />
                ) : r.amount_kind === 'estimated' ? (
                  <Badge text={t.recurring.est} color={c.secondaryLabel} />
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
