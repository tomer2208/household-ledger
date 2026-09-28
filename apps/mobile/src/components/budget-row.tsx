import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, CategoryIcon, Icon, ProgressBar } from './ui';
import { budgetStatus } from '@/lib/budget';
import { formatMoney } from '@/lib/money';
import { budgetTone, moneyText, useColors } from '@/lib/theme';

// One category's month at a glance: what's left (or over) first, then the bar with the pace
// marker, then spent of cap. Used by Overview and Settings → Categories.
export function BudgetRow({
  name,
  symbol,
  cap,
  spent,
  noBudget,
  currency,
  pace,
  onPress,
  last,
}: {
  name: string;
  symbol: string;
  cap: number | null;
  spent: number;
  noBudget?: boolean;
  currency: string;
  pace?: number;
  onPress?: () => void;
  last?: boolean;
}) {
  const c = useColors();
  const st = budgetStatus(cap, spent);
  const tone = st.kind === 'none' ? c.secondaryLabel : budgetTone(st.pct, c, pace);
  const ahead = st.kind === 'left' && pace != null && st.pct - pace >= 15;

  const label =
    st.kind === 'none'
      ? `${name}, ${formatMoney(spent, currency)} spent, no budget`
      : `${name}, ${formatMoney(st.amount, currency)} ${st.kind} of ${formatMoney(st.cap, currency)}` +
        (st.kind === 'left' && pace != null ? (ahead ? ', ahead of pace' : ', on pace') : '');

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: c.fill }]}>
      <CategoryIcon symbol={symbol} />
      <View style={[s.body, !last && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={s.top}>
          <Text numberOfLines={1} style={[s.name, { color: c.label }]}>
            {name}
          </Text>
          {st.kind === 'none' ? (
            <Text style={[s.small, { color: c.secondaryLabel }]}>{formatMoney(spent, currency)} spent</Text>
          ) : (
            <View style={s.status}>
              {st.kind === 'over' ? <Icon name="exclamationmark.triangle.fill" size={15} color={tone} /> : null}
              <Text style={[s.amount, { color: tone }]}>
                {formatMoney(st.amount, currency)} {st.kind}
              </Text>
            </View>
          )}
        </View>
        {st.kind === 'none' ? (
          noBudget ? (
            <View style={s.badgeRow}>
              <Badge text="No budget" color={c.orange} />
            </View>
          ) : (
            <Text style={[s.small, { color: c.secondaryLabel }]}>No budget</Text>
          )
        ) : (
          <>
            <ProgressBar pct={st.pct} color={tone} pace={pace} />
            <Text style={[s.small, s.of, { color: c.secondaryLabel }]}>
              {formatMoney(st.spent, currency)} of {formatMoney(st.cap, currency)}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 12 },
  body: { flex: 1, paddingVertical: 12, paddingRight: 16, gap: 6, minHeight: 56 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 17, flexShrink: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amount: { fontSize: 20, fontWeight: '600', ...moneyText },
  small: { fontSize: 13, ...moneyText },
  of: { textAlign: 'right' },
  badgeRow: { flexDirection: 'row' },
});
