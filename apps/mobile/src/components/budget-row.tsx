import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BudgetBreakdown } from './budget-breakdown';
import { Badge, CategoryIcon, Icon, ProgressBar } from './ui';
import type { Fund } from '@/api/types';
import { budgetStatus } from '@/lib/budget';
import { t } from '@/lib/i18n';
import { money } from './money-text';
import { textEnd } from '@/lib/rtl';
import { budgetTone, moneyText, useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

// One category's month at a glance: what's left (or over) first, then the bar with the pace
// marker, then spent of cap. Used by Overview and Settings → Categories.
export function BudgetRow({
  name,
  symbol,
  categoryId,
  cap,
  carry = 0,
  reserve = 0,
  funds = [],
  spent,
  noBudget,
  currency,
  pace,
  forecast,
  onPress,
  onLongPress,
  actions,
  last,
}: {
  name: string;
  symbol: string;
  // P2: the category's own icon and colour
  categoryId?: string;
  cap: number | null;
  // P1-14: what carried in from last month, already part of cap (negative after an overspend)
  carry?: number;
  // P1-16: what spread payments set aside (−) or release (+), also part of cap, and their funds
  reserve?: number;
  funds?: Fund[];
  spent: number;
  noBudget?: boolean;
  currency: string;
  pace?: number;
  // P1-17: where the category is heading by month end (current month only)
  forecast?: number | null;
  onPress?: () => void;
  onLongPress?: () => void;
  // Offered to VoiceOver/TalkBack as custom actions, so swipe-only actions stay reachable.
  actions?: { name: string; label: string; run: () => void }[];
  last?: boolean;
}) {
  const c = useColors();
  const st = budgetStatus(cap, spent);
  const tone = st.kind === 'none' ? c.secondaryLabel : budgetTone(st.pct, c);
  const ahead = st.kind === 'left' && pace != null && st.pct - pace >= 15;
  // Only worth a mark when more is still expected than is already spent.
  const heading = forecast != null && forecast > spent ? forecast : null;
  const headingOver = heading != null && st.kind !== 'none' && heading > st.cap;

  const label =
    st.kind === 'none'
      ? t.budget.a11yNone(name, money(spent, currency))
      : t.budget.a11y(name, money(st.amount, currency), st.kind, money(st.cap, currency)) +
        (st.kind === 'left' && pace != null ? (ahead ? t.budget.aheadOfPace : t.budget.onPace) : '') +
        (heading != null ? t.budget.a11yForecast(money(heading, currency)) : '');

  // Opaque base: the pressed tint is translucent, and swipe actions sit right behind the row.
  return (
    <View style={{ backgroundColor: c.cell }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        disabled={!onPress && !onLongPress}
        accessibilityActions={actions?.map(({ name, label }) => ({ name, label }))}
        onAccessibilityAction={(e) => actions?.find((x) => x.name === e.nativeEvent.actionName)?.run()}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={label}
        style={({ pressed }) => [s.row, pressed && { backgroundColor: c.fill }]}>
        <CategoryIcon symbol={symbol} categoryId={categoryId} />
        <View style={[s.body, !last && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={s.top}>
            <Text numberOfLines={1} style={[s.name, { color: c.label }]}>
              {name}
            </Text>
            {st.kind === 'none' ? (
              <Text style={[s.small, { color: c.secondaryLabel }]}>{t.budget.spent(money(spent, currency))}</Text>
            ) : (
              <View style={s.status}>
                {st.kind === 'over' ? <Icon name="exclamationmark.triangle.fill" size={15} color={tone} /> : null}
                <Text style={[s.amount, { color: tone }]}>
                  {st.kind === 'left' ? t.budget.left(money(st.amount, currency)) : t.budget.over(money(st.amount, currency))}
                </Text>
              </View>
            )}
          </View>
          {st.kind === 'none' ? (
            noBudget ? (
              <View style={s.badgeRow}>
                <Badge text={t.overview.noBudget} color={c.orange} />
              </View>
            ) : (
              <Text style={[s.small, { color: c.secondaryLabel }]}>{t.overview.noBudget}</Text>
            )
          ) : (
            <>
              <ProgressBar
                pct={st.pct}
                color={tone}
                pace={pace}
                forecast={heading != null ? (heading * 100) / st.cap : undefined}
              />
              <Text style={[s.small, { color: c.secondaryLabel, textAlign: textEnd() }]}>
                {t.common.of(money(st.spent, currency), money(st.cap, currency))}
                {heading != null ? (
                  <Text style={{ color: headingOver ? c.orange : c.secondaryLabel }}>
                    {' · '}
                    {t.budget.forecast(money(heading, currency))}
                  </Text>
                ) : null}
              </Text>
              <BudgetBreakdown base={st.cap - carry - reserve} carry={carry} reserve={reserve} funds={funds} currency={currency} />
            </>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingStart: 16, gap: 12 },
  body: { flex: 1, paddingVertical: 12, paddingEnd: 16, gap: 6, minHeight: 56 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontFamily: fontFamily.body, fontSize: 17, flexShrink: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amount: { fontSize: 20, fontWeight: '600', ...moneyText },
  small: { fontSize: 13, ...moneyText },
  badgeRow: { flexDirection: 'row' },
});
